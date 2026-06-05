/**
 * WhatsappBusinessAdapter — Meta WhatsApp Business Cloud API adapter.
 *
 * Inbound: Webhook handler factory (`createWebhookHandler(secret)`) for
 * production use, plus poll-mode fallback for dev/test.
 *
 * Outbound: POST to `https://graph.facebook.com/v23.0/{phone_number_id}/messages`
 * Supports:
 *   - Text messages (within 24h customer-service window)
 *   - Template messages (required outside 24h window or for marketing)
 *   - Emoji reactions
 *
 * 24-hour window enforcement: WhatsApp Business requires that non-template
 * messages are sent within 24 hours of the last customer inbound. Outside that
 * window you MUST use an approved template. `send()` enforces this by default
 * (window_mode='enforce'). Pass a `meta.template` in OutboundMessage.meta to
 * use a template instead.
 *
 * Auth: Permanent System User Access Token.
 * Tenant provides: phone_number_id, business_account_id, permanent_access_token.
 * Graph API version: v23.0 (current stable as of 2026-06).
 *
 * References:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { createHmac } from 'node:crypto';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  Attachment,
} from './types.js';
import { AdapterConfigError, WindowExpiredError } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WhatsappBusinessAdapterOptions {
  /** Penelope tenant id. */
  tenant_id: string;
  /** WhatsApp Phone Number ID from Meta Business Manager. */
  phone_number_id: string;
  /** WhatsApp Business Account ID (WABA ID). */
  business_account_id: string;
  /** Permanent System User Access Token. */
  permanent_access_token: string;
  /** Graph API version. Default: 'v23.0'. */
  graph_version?: string;
  /**
   * 24-hour customer-service window enforcement.
   * 'enforce' (default): throw WindowExpiredError on text send outside window.
   * 'warn': log but still attempt (for testing only).
   * 'off': no enforcement.
   */
  window_mode?: 'enforce' | 'warn' | 'off';
  /** Webhook secret for HMAC-SHA256 signature verification. */
  webhook_secret?: string;
  /** Poll interval in ms (poll-mode fallback). Default 30 000. */
  pollIntervalMs?: number;
  /** Pluggable logger. */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: replace globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
  /** Test seam: skip poll loop. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API shapes
// ---------------------------------------------------------------------------

export interface WaTemplateParam {
  type: 'text';
  text: string;
}

export interface WaTemplate {
  /** Approved template name (snake_case). */
  name: string;
  /** BCP-47 language code. Default 'en_US'. */
  language?: string;
  /** Named parameters for template body variables. */
  components?: WaTemplateComponent[];
}

export interface WaTemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters: WaTemplateParam[];
}

/** Webhook payload from Meta */
interface WaWebhookPayload {
  object: string;
  entry?: WaEntry[];
}

interface WaEntry {
  id: string;
  changes?: WaChange[];
}

interface WaChange {
  value: WaValue;
  field: string;
}

interface WaValue {
  messaging_product: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WaInboundMessage[];
  statuses?: WaStatusUpdate[];
  errors?: WaError[];
}

interface WaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  context?: { from?: string; id?: string };
}

interface WaStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: { id?: string; expiration_timestamp?: string; origin?: { type?: string } };
  pricing?: { billable?: boolean; pricing_model?: string; category?: string };
  errors?: WaError[];
}

interface WaError {
  code: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface WaSendResponse {
  messaging_product?: string;
  contacts?: { input?: string; wa_id?: string }[];
  messages?: { id?: string }[];
  error?: { message: string; code: number; type?: string; fbtrace_id?: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.facebook.com';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Returns true if `nowMs` is within 24h of `lastCustomerMs`. */
export function withinWhatsappWindow(lastCustomerMs: number, nowMs = Date.now()): boolean {
  return nowMs - lastCustomerMs < TWENTY_FOUR_HOURS_MS;
}

/** Verify Meta webhook HMAC-SHA256 signature. */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  // signature format: "sha256=<hex>"
  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  // Constant-time comparison via HMAC trick
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedBuf.length; i++) {
    diff |= expectedBuf[i]! ^ providedBuf[i]!;
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Message status tracking
// ---------------------------------------------------------------------------

export interface WaMessageStatus {
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: WaError[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class WhatsappBusinessAdapter implements ChannelAdapter {
  readonly name = 'whatsapp-business';

  private readonly tenantId: string;
  private readonly phoneNumberId: string;
  private readonly businessAccountId: string;
  private readonly accessToken: string;
  private readonly graphVersion: string;
  private readonly windowMode: NonNullable<WhatsappBusinessAdapterOptions['window_mode']>;
  private readonly webhookSecret: string | undefined;
  private readonly pollIntervalMs: number;
  private readonly log: NonNullable<WhatsappBusinessAdapterOptions['logger']>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;

  /** Track seen message IDs to avoid double-delivery. */
  private seen = new Set<string>();
  /** Track last customer message time per wa_id for 24h window enforcement. */
  private lastCustomerMs: Map<string, number> = new Map();
  /** Track outbound message statuses. */
  private messageStatuses: Map<string, WaMessageStatus> = new Map();

  constructor(opts: WhatsappBusinessAdapterOptions) {
    if (!opts.tenant_id?.trim())
      throw new AdapterConfigError('whatsapp-business', 'tenant_id is required');
    if (!opts.phone_number_id?.trim())
      throw new AdapterConfigError('whatsapp-business', 'phone_number_id is required');
    if (!opts.business_account_id?.trim())
      throw new AdapterConfigError('whatsapp-business', 'business_account_id is required');
    if (!opts.permanent_access_token?.trim())
      throw new AdapterConfigError('whatsapp-business', 'permanent_access_token is required');

    this.tenantId = opts.tenant_id;
    this.phoneNumberId = opts.phone_number_id;
    this.businessAccountId = opts.business_account_id;
    this.accessToken = opts.permanent_access_token;
    this.graphVersion = opts.graph_version ?? 'v23.0';
    this.windowMode = opts.window_mode ?? 'enforce';
    this.webhookSecret = opts.webhook_secret;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[whatsapp-business:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[whatsapp-business:${this.tenantId}] ${m}`),
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
    const waId = out.external_thread_id;
    const template = out.meta?.['template'] as WaTemplate | undefined;

    // 24-hour window enforcement — text messages only; templates bypass the window
    if (!template && this.windowMode !== 'off') {
      const lastMs = this.lastCustomerMs.get(waId);
      if (lastMs !== undefined && !withinWhatsappWindow(lastMs)) {
        const msg = `WhatsApp 24h customer-service window expired for ${waId}. Use a template message.`;
        if (this.windowMode === 'enforce') {
          throw new WindowExpiredError(msg);
        }
        this.log.error(`[window-warn] ${msg} — attempting send anyway (window_mode=warn)`);
      }
    }

    let body: Record<string, unknown>;

    if (template) {
      body = this.buildTemplatePayload(waId, template);
    } else {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: waId,
        type: 'text',
        text: { preview_url: false, body: out.text },
      };
    }

    return this.postMessage(body);
  }

  async react(external_id: string, emoji: string): Promise<void> {
    // Reactions in WhatsApp require knowing the wa_id of the recipient.
    // Since we don't store that mapping in a single field, react() is exposed
    // primarily for webhook-flow scenarios where meta carries the wa_id.
    // For direct use, callers should use sendReaction() with the wa_id.
    this.log.info(`react called for message ${external_id} with ${emoji} — use sendReaction() for full control`);
  }

  // -------------------------------------------------------------------------
  // Extended API
  // -------------------------------------------------------------------------

  /** Send a reaction to a specific message. */
  async sendReaction(waId: string, messageId: string, emoji: string): Promise<{ external_id: string }> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waId,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    };
    return this.postMessage(body);
  }

  /** Send a template message directly (for marketing / outside 24h window). */
  async sendTemplate(waId: string, template: WaTemplate): Promise<{ external_id: string }> {
    const body = this.buildTemplatePayload(waId, template);
    return this.postMessage(body);
  }

  /**
   * Create an Express/Node HTTP webhook handler.
   * Handles both GET (hub.verify) and POST (event delivery).
   *
   * Usage:
   *   app.use('/webhooks/whatsapp', adapter.createWebhookHandler('my-verify-token'));
   *
   * The `verifyToken` is the hub.verify_token you set in Meta's webhook config.
   * Signature verification uses `webhook_secret` from the adapter options.
   */
  createWebhookHandler(verifyToken: string): (req: WebhookRequest, res: WebhookResponse) => void {
    return (req, res) => {
      if (req.method === 'GET') {
        this.handleVerify(req, res, verifyToken);
        return;
      }
      if (req.method === 'POST') {
        this.handleEvent(req, res);
        return;
      }
      res.status(405).send('Method Not Allowed');
    };
  }

  /**
   * Process a raw webhook payload directly (e.g. from a parsed request body).
   * Returns the number of messages delivered to onInbound.
   */
  async processWebhookPayload(payload: unknown): Promise<number> {
    if (!this.onInbound) throw new Error('processWebhookPayload: call start() first');
    let delivered = 0;
    const wa = payload as WaWebhookPayload;
    if (wa.object !== 'whatsapp_business_account') return 0;

    for (const entry of wa.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const val = change.value;

        // Process status updates
        for (const status of val.statuses ?? []) {
          this.updateMessageStatus(status);
        }

        // Process inbound messages
        for (const msg of val.messages ?? []) {
          if (this.seen.has(msg.id)) continue;
          this.seen.add(msg.id);

          // Update 24h window tracking
          const tsMs = parseInt(msg.timestamp, 10) * 1000;
          this.lastCustomerMs.set(msg.from, tsMs);

          const contactName = val.contacts?.find(c => c.wa_id === msg.from)?.profile?.name;
          const inbound = this.normalise(msg, contactName);
          try {
            await this.onInbound(inbound);
            delivered++;
          } catch (err) {
            this.log.error(`onInbound failed: ${(err as Error).message}`);
          }
        }
      }
    }

    // Keep seen set bounded
    if (this.seen.size > 10_000) {
      const arr = [...this.seen];
      this.seen = new Set(arr.slice(arr.length - 5_000));
    }

    return delivered;
  }

  /** Get current status of a sent message. */
  getMessageStatus(messageId: string): WaMessageStatus | undefined {
    return this.messageStatuses.get(messageId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private buildTemplatePayload(waId: string, template: WaTemplate): Record<string, unknown> {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waId,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language ?? 'en_US' },
        components: template.components ?? [],
      },
    };
  }

  private async postMessage(body: Record<string, unknown>): Promise<{ external_id: string }> {
    const url = `${GRAPH_BASE}/${this.graphVersion}/${this.phoneNumberId}/messages`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') ?? '60';
      throw new Error(`WhatsApp rate limit (429). Retry after ${retryAfter}s`);
    }

    const data = (await res.json()) as WaSendResponse;
    if (data.error) {
      throw new Error(`WhatsApp Cloud API error ${data.error.code}: ${data.error.message}`);
    }
    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      throw new Error('WhatsApp Cloud API: no message id in response');
    }
    return { external_id: messageId };
  }

  private normalise(msg: WaInboundMessage, displayName?: string): InboundMessage {
    const attachments: Attachment[] = [];

    if (msg.image) {
      attachments.push({ kind: 'image', external_id: msg.image.id, mime_type: msg.image.mime_type });
    } else if (msg.audio) {
      attachments.push({ kind: 'audio', external_id: msg.audio.id, mime_type: msg.audio.mime_type });
    } else if (msg.video) {
      attachments.push({ kind: 'video', external_id: msg.video.id, mime_type: msg.video.mime_type });
    } else if (msg.document) {
      attachments.push({ kind: 'document', external_id: msg.document.id, mime_type: msg.document.mime_type, filename: msg.document.filename });
    } else if (msg.sticker) {
      attachments.push({ kind: 'sticker', external_id: msg.sticker.id, mime_type: msg.sticker.mime_type });
    } else if (msg.location) {
      attachments.push({ kind: 'location', url: `geo:${msg.location.latitude},${msg.location.longitude}` });
    }

    return {
      id: msg.id,
      channel: 'whatsapp-business',
      tenant_id: this.tenantId,
      external_thread_id: msg.from,
      external_user_id: msg.from,
      user_display_name: displayName,
      text: msg.text?.body ?? '',
      attachments: attachments.length > 0 ? attachments : undefined,
      received_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
      raw: msg,
    };
  }

  private updateMessageStatus(status: WaStatusUpdate): void {
    const existing = this.messageStatuses.get(status.id);
    // Status progression: sent → delivered → read. Don't regress.
    const order: WaStatusUpdate['status'][] = ['sent', 'delivered', 'read', 'failed'];
    if (existing) {
      const prev = order.indexOf(existing.status);
      const next = order.indexOf(status.status);
      if (next <= prev && status.status !== 'failed') return;
    }
    this.messageStatuses.set(status.id, {
      status: status.status,
      timestamp: status.timestamp,
      recipient_id: status.recipient_id,
      errors: status.errors,
    });
    this.log.info(`message ${status.id} status → ${status.status}`);
  }

  private handleVerify(req: WebhookRequest, res: WebhookResponse, verifyToken: string): void {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token === verifyToken) {
      this.log.info('Webhook verified successfully');
      res.status(200).send(challenge ?? '');
    } else {
      this.log.error('Webhook verification failed: token mismatch');
      res.status(403).send('Forbidden');
    }
  }

  private handleEvent(req: WebhookRequest, res: WebhookResponse): void {
    // Verify signature if secret is configured
    if (this.webhookSecret) {
      const sig = req.headers?.['x-hub-signature-256'] ?? '';
      const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
      if (!verifyWebhookSignature(rawBody, sig, this.webhookSecret)) {
        this.log.error('Webhook signature verification failed');
        res.status(401).send('Unauthorized');
        return;
      }
    }

    // Process async without blocking the HTTP response
    this.processWebhookPayload(req.body ?? {}).catch(err => {
      this.log.error(`processWebhookPayload error: ${(err as Error).message}`);
    });

    res.status(200).send('EVENT_RECEIVED');
  }

  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      // Poll-mode fallback: WhatsApp Cloud API doesn't support polling for messages
      // in the same way as Facebook Messenger. In production, use createWebhookHandler().
      // This loop is a no-op placeholder that keeps the adapter alive for webhook-driven use.
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

// ---------------------------------------------------------------------------
// Minimal HTTP handler interface (framework-agnostic)
// ---------------------------------------------------------------------------

export interface WebhookRequest {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** Raw body bytes/string for HMAC verification. */
  rawBody?: string | Buffer;
}

export interface WebhookResponse {
  status(code: number): WebhookResponse;
  send(body: string): void;
}
