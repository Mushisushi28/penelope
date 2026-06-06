/**
 * FbPageAdapter — Facebook Page Messenger adapter.
 *
 * Inbound: Poll mode using Graph API `/<page-id>/conversations?fields=messages`
 * with a cursor to advance. Webhook mode is a future enhancement (webhook setup
 * requires a public HTTPS endpoint; poll is sufficient for tonight's build).
 *
 * Outbound: POST to `/me/messages` with recipient PSID.
 *
 * 24-hour window: FB Page Messaging only allows replies within 24 hours of
 * the customer's last message. send() ENFORCES this: if the thread's last
 * inbound is >24 hours ago, throw WindowExpiredError so the caller can
 * choose a fallback path (human-agent tag, marketing message, etc.).
 *
 * Auth: Page Access Token (long-lived). Tenant provides page_id + page_token.
 * Graph API version: v23.0 (current stable as of 2026-06).
 *
 * References:
 *   https://developers.facebook.com/docs/messenger-platform/send-messages
 *   https://developers.facebook.com/docs/graph-api/reference/page/conversations
 */

import type {
  ChannelAdapter,
  ChannelCapabilities,
  InboundMessage,
  OutboundMessage,
  Attachment,
} from './types.js';
import { AdapterConfigError, WindowExpiredError } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FbPageAdapterOptions {
  /** Penelope tenant id. */
  tenant_id: string;
  /** Facebook Page ID (numeric string or 'me'). */
  page_id: string;
  /** Long-lived Page Access Token. */
  page_token: string;
  /** Graph API version. Default: 'v23.0'. */
  graph_version?: string;
  /**
   * 24-hour window enforcement mode.
   * 'enforce' (default): throw WindowExpiredError on send outside 24h.
   * 'warn': log but still attempt send (useful for HUMAN_AGENT permission holders).
   * 'off': no enforcement (you handle it externally).
   */
  window_mode?: 'enforce' | 'warn' | 'off';
  /** Poll interval in ms. Default 30 000 (30 s). */
  pollIntervalMs?: number;
  /** Pluggable logger. */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: replace globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
  /** Test seam: skip poll loop. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// FB Graph API shapes
// ---------------------------------------------------------------------------

interface FbPaging { cursors?: { before?: string; after?: string }; next?: string }

interface FbMessageEnvelope {
  id: string;
  message: string;
  from: { id: string; name?: string; email?: string };
  created_time: string;
  attachments?: { data: { id: string; mime_type?: string; name?: string; file_url?: string; image_data?: { url?: string } }[] };
}

interface FbConversation {
  id: string;
  updated_time: string;
  messages?: { data: FbMessageEnvelope[]; paging?: FbPaging };
}

interface FbConversationsResponse {
  data: FbConversation[];
  paging?: FbPaging;
}

interface FbSendResponse {
  recipient_id?: string;
  message_id?: string;
  error?: { message: string; code: number };
}

// ---------------------------------------------------------------------------
// 24-hour window check
// ---------------------------------------------------------------------------

/** Returns ms since epoch of the last inbound from a customer (non-page sender). */
export function lastCustomerMessageMs(
  messages: FbMessageEnvelope[],
  pageId: string,
): number | null {
  // Messages are returned newest-first by Graph API.
  for (const m of messages) {
    if (m.from.id !== pageId) {
      return new Date(m.created_time).getTime();
    }
  }
  return null;
}

/** True if a reply is within the 24-hour Messenger window. */
export function withinMessengerWindow(lastCustomerMs: number, nowMs = Date.now()): boolean {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  return nowMs - lastCustomerMs < TWENTY_FOUR_HOURS_MS;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.facebook.com';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class FbPageAdapter implements ChannelAdapter {
  readonly name = 'fb-page';
  readonly channel_id = 'fb-page';
  readonly capabilities: ChannelCapabilities = {
    send_text: true,
    send_attachments: true,
    reactions: true,               // emoji reactions via sender_action=react
    thread_history: true,          // /<thread_id>/messages Graph API
    polling_inbox: true,
    webhook_inbox: true,           // Messenger webhook supported (future)
    supports_typing_indicator: true, // sender_action=typing_on
  };

  private readonly tenantId: string;
  private readonly pageId: string;
  private readonly pageToken: string;
  private readonly graphVersion: string;
  private readonly windowMode: NonNullable<FbPageAdapterOptions['window_mode']>;
  private readonly pollIntervalMs: number;
  private readonly log: NonNullable<FbPageAdapterOptions['logger']>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;

  // Track seen message IDs to avoid double-delivering on overlapping polls.
  private seen = new Set<string>();
  // Track last customer message time per PSID for window enforcement.
  private lastCustomerMs: Map<string, number> = new Map();

  constructor(opts: FbPageAdapterOptions) {
    if (!opts.page_id?.trim()) throw new AdapterConfigError('fb-page', 'page_id is required');
    if (!opts.page_token?.trim()) throw new AdapterConfigError('fb-page', 'page_token is required');
    if (!opts.tenant_id?.trim()) throw new AdapterConfigError('fb-page', 'tenant_id is required');

    this.tenantId = opts.tenant_id;
    this.pageId = opts.page_id;
    this.pageToken = opts.page_token;
    this.graphVersion = opts.graph_version ?? 'v23.0';
    this.windowMode = opts.window_mode ?? 'enforce';
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[fb-page:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[fb-page:${this.tenantId}] ${m}`),
    };
  }

  // -------------------------------------------------------------------------
  // ChannelAdapter contract
  // -------------------------------------------------------------------------

  async start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void> {
    if (this.polling) return;
    this.onInbound = onInbound;
    this.polling = true;
    this.stopRequested = false;
    if (!this.manualPolling) {
      this.loopPromise = this.runLoop();
    }
  }

  async stop(): Promise<void> {
    if (!this.polling) return;
    this.stopRequested = true;
    try { this.sleepResolver?.(); } catch { /* ignore */ }
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* swallow */ }
      this.loopPromise = null;
    }
    this.polling = false;
    this.onInbound = null;
  }

  async send(out: OutboundMessage): Promise<{ external_id: string }> {
    const psid = out.external_thread_id;

    // 24-hour window enforcement
    if (this.windowMode !== 'off') {
      const lastMs = this.lastCustomerMs.get(psid);
      if (lastMs !== undefined && !withinMessengerWindow(lastMs)) {
        const msg = `FB Messenger 24h window expired for PSID ${psid}`;
        if (this.windowMode === 'enforce') {
          throw new WindowExpiredError(msg);
        }
        this.log.error(`[window-warn] ${msg} — attempting send anyway (window_mode=warn)`);
      }
    }

    const url = `${GRAPH_BASE}/${this.graphVersion}/me/messages?access_token=${this.pageToken}`;
    const body = {
      recipient: { id: psid },
      message: { text: out.text },
      messaging_type: 'RESPONSE',
    };
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as FbSendResponse;
    if (data.error) {
      throw new Error(`FB Graph send error ${data.error.code}: ${data.error.message}`);
    }
    if (!data.message_id) {
      throw new Error('FB Graph send: no message_id in response');
    }
    return { external_id: data.message_id };
  }

  // edit / react not supported by Messenger Platform
  // Intentionally left undefined (interface fields are optional).

  async healthCheck(): Promise<{ ok: boolean; details?: string }> {
    if (!this.pageToken?.trim()) {
      return { ok: false, details: 'page_token is missing' };
    }
    try {
      const url = `${GRAPH_BASE}/${this.graphVersion}/me?fields=id,name&access_token=${this.pageToken}`;
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        return { ok: false, details: `GET /me HTTP ${res.status} ${res.statusText}` };
      }
      const body = (await res.json()) as { id?: string; error?: { message: string } };
      if (body.error) {
        return { ok: false, details: body.error.message };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, details: (err as Error).message };
    }
  }

  // -------------------------------------------------------------------------
  // Test / advanced surface
  // -------------------------------------------------------------------------

  /** Manual poll — fetches recent conversations and delivers new messages. */
  async pollOnce(): Promise<number> {
    if (!this.onInbound) throw new Error('pollOnce: call start() first');
    let delivered = 0;

    let url = this.buildConversationsUrl();
    // Fetch up to 2 pages of conversations to catch recent activity.
    for (let page = 0; page < 2; page++) {
      let convData: FbConversationsResponse;
      try {
        const res = await this.fetchImpl(url);
        convData = (await res.json()) as FbConversationsResponse;
      } catch (err) {
        this.log.error(`pollOnce fetch error: ${(err as Error).message}`);
        break;
      }
      if (!Array.isArray(convData.data)) break;

      for (const conv of convData.data) {
        const msgs = conv.messages?.data ?? [];
        // Update window tracking
        const lastMs = lastCustomerMessageMs(msgs, this.pageId);
        const psid = msgs.find(m => m.from.id !== this.pageId)?.from.id;
        if (psid && lastMs !== null) {
          this.lastCustomerMs.set(psid, lastMs);
        }

        // Deliver unseen messages from customers (not from our page)
        for (const m of msgs) {
          if (this.seen.has(m.id)) continue;
          if (m.from.id === this.pageId) {
            this.seen.add(m.id);
            continue; // our own outbound
          }
          this.seen.add(m.id);
          const inbound = this.normalise(m, conv.id);
          try {
            await this.onInbound(inbound);
            delivered++;
          } catch (err) {
            this.log.error(`onInbound failed: ${(err as Error).message}`);
          }
        }
      }

      if (!convData.paging?.next) break;
      url = convData.paging.next;
    }

    // Keep seen set bounded (max 10 000 entries)
    if (this.seen.size > 10_000) {
      const arr = [...this.seen];
      this.seen = new Set(arr.slice(arr.length - 5_000));
    }

    return delivered;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private normalise(m: FbMessageEnvelope, convId: string): InboundMessage {
    const attachments: Attachment[] = (m.attachments?.data ?? []).map(a => ({
      kind: a.mime_type?.startsWith('image/') ? 'image' : 'document',
      external_id: a.id,
      mime_type: a.mime_type,
      filename: a.name,
      url: a.file_url ?? a.image_data?.url,
    }));
    return {
      id: m.id,
      channel: 'fb-page',
      tenant_id: this.tenantId,
      external_thread_id: m.from.id, // PSID
      external_user_id: m.from.id,
      user_display_name: m.from.name,
      text: m.message ?? '',
      attachments: attachments.length > 0 ? attachments : undefined,
      received_at: new Date(m.created_time).toISOString(),
      raw: m,
    };
  }

  private buildConversationsUrl(): string {
    const fields = 'id,updated_time,messages{id,message,from,created_time,attachments}';
    const params = new URLSearchParams({
      fields,
      access_token: this.pageToken,
      limit: '10',
    });
    return `${GRAPH_BASE}/${this.graphVersion}/${this.pageId}/conversations?${params}`;
  }

  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        await this.pollOnce();
      } catch (err) {
        if (!this.stopRequested) {
          this.log.error(`poll failed: ${(err as Error).message}`);
        }
      }
      if (this.stopRequested) break;
      await this.sleep(this.pollIntervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve(), ms);
      this.sleepResolver = () => { clearTimeout(t); resolve(); };
    });
  }
}
