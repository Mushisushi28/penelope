/**
 * InstagramAdapter — Instagram DM adapter (STUB).
 *
 * Uses Instagram Messaging API via Facebook Graph API (same Page token as
 * fb-page adapter — the IG account must be connected to the FB Page).
 *
 * Status: STUB — interface is correctly implemented; poll and send methods
 * contain TODO markers where the real Graph API calls go.
 *
 * Why a stub:
 *   - Instagram DM API requires the app to pass App Review for
 *     instagram_manage_messages permission.
 *   - The conversation/thread shape differs from FB Page Messenger —
 *     separate implementation is warranted once approved.
 *
 * Conversation endpoint (v23.0):
 *   GET /{ig-user-id}/conversations?platform=instagram&...
 *
 * Send endpoint:
 *   POST /me/messages (same as Messenger, different platform parameter)
 *
 * References:
 *   https://developers.facebook.com/docs/messenger-platform/instagram
 */

import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from './types.js';
import { AdapterConfigError } from './types.js';

export interface InstagramAdapterOptions {
  tenant_id: string;
  /** Instagram Business User ID (numeric string). */
  ig_user_id: string;
  /**
   * Page Access Token with instagram_manage_messages permission.
   * Requires App Review approval before production use.
   */
  page_token: string;
  graph_version?: string;
  pollIntervalMs?: number;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  fetchImpl?: typeof globalThis.fetch;
  manualPolling?: boolean;
}

const GRAPH_BASE = 'https://graph.facebook.com';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class InstagramAdapter implements ChannelAdapter {
  readonly name = 'instagram';

  private readonly tenantId: string;
  private readonly igUserId: string;
  private readonly pageToken: string;
  private readonly graphVersion: string;
  private readonly pollIntervalMs: number;
  private readonly log: NonNullable<InstagramAdapterOptions['logger']>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;

  constructor(opts: InstagramAdapterOptions) {
    if (!opts.tenant_id?.trim()) throw new AdapterConfigError('instagram', 'tenant_id is required');
    if (!opts.ig_user_id?.trim()) throw new AdapterConfigError('instagram', 'ig_user_id is required');
    if (!opts.page_token?.trim()) throw new AdapterConfigError('instagram', 'page_token is required');

    this.tenantId = opts.tenant_id;
    this.igUserId = opts.ig_user_id;
    this.pageToken = opts.page_token;
    this.graphVersion = opts.graph_version ?? 'v23.0';
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[instagram:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[instagram:${this.tenantId}] ${m}`),
    };
  }

  async start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void> {
    if (this.polling) return;
    this.onInbound = onInbound;
    this.polling = true;
    this.stopRequested = false;
    this.log.info('Instagram adapter started (STUB — polling not yet implemented)');
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
    // TODO: implement Instagram DM send via Graph API
    // POST https://graph.facebook.com/v23.0/me/messages?access_token=<page_token>
    // Body: { recipient: { id: <igsid> }, message: { text: out.text } }
    // Requires instagram_manage_messages app review permission.
    this.log.error('InstagramAdapter.send() is a stub — not yet implemented');
    throw new Error(
      'InstagramAdapter.send() is a stub. Implement after instagram_manage_messages App Review approval.'
    );
  }

  async pollOnce(): Promise<number> {
    // TODO: poll /{ig_user_id}/conversations?platform=instagram&fields=...
    // for new DMs; normalise to InboundMessage; call onInbound.
    this.log.info('InstagramAdapter.pollOnce() is a stub — no-op');
    return 0;
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
