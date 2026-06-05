/**
 * TwilioSmsAdapter — SMS channel adapter via Twilio.
 *
 * Inbound: Poll mode (Twilio Messages list API every 30s, default) or
 *          webhook mode (call twilioWebhookHandler() to get an Express-compatible
 *          request handler to mount on your HTTP server).
 *
 * Outbound: Twilio REST API POST /Accounts/{SID}/Messages.json
 *
 * Auth: accountSid + authToken + fromNumber (E.164, e.g. "+15005550006")
 *
 * Phone number validation: helpers exported for testing and registry use.
 */

import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from './types.js';
import { AdapterConfigError } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TwilioSmsAdapterOptions {
  tenant_id: string;
  accountSid: string;
  authToken: string;
  /** Your Twilio number — the "from" for all outbound SMS (E.164). */
  fromNumber: string;
  /** Poll interval in ms. Default 30 000. Ignored in webhook mode. */
  pollIntervalMs?: number;
  /** Mode: 'poll' (default) or 'webhook'. */
  mode?: 'poll' | 'webhook';
  /** Pluggable logger. */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: replace globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
  /** Test seam: skip poll loop. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// Twilio API shapes
// ---------------------------------------------------------------------------

interface TwilioMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-reply' | string;
  status: string;
  date_created: string;
  date_sent: string | null;
}

interface TwilioMessagesList {
  messages: TwilioMessage[];
  next_page_uri: string | null;
}

interface TwilioSendResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

// ---------------------------------------------------------------------------
// Phone number validation helper
// ---------------------------------------------------------------------------

const E164_RE = /^\+[1-9]\d{1,14}$/;

/** Returns true if the number is a valid E.164 string. */
export function isValidE164(number: string): boolean {
  return E164_RE.test(number);
}

/** Throws if the number is not a valid E.164. */
export function assertE164(fieldName: string, value: string): void {
  if (!isValidE164(value)) {
    throw new AdapterConfigError(
      'twilio-sms',
      `${fieldName} must be a valid E.164 number (e.g. "+15005550006"). Got: ${JSON.stringify(value)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook handler factory (Express-compatible)
// ---------------------------------------------------------------------------

/**
 * Returns an Express-compatible middleware that processes Twilio webhook POSTs.
 * Mount this on your HTTP server, e.g.:
 *   app.post('/webhooks/sms', twilioSmsAdapter.webhookHandler())
 *
 * Note: This does NOT verify the Twilio signature. In production, add
 * twilio.validateRequest() middleware or equivalent before this handler.
 */
export type WebhookHandler = (
  req: { body: Record<string, string> },
  res: { sendStatus: (code: number) => void },
  next?: () => void
) => void;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class TwilioSmsAdapter implements ChannelAdapter {
  readonly name = 'twilio-sms';

  private readonly tenantId: string;
  private readonly accountSid: string;
  private readonly authHeader: string;
  private readonly fromNumber: string;
  private readonly pollIntervalMs: number;
  private readonly mode: NonNullable<TwilioSmsAdapterOptions['mode']>;
  private readonly log: NonNullable<TwilioSmsAdapterOptions['logger']>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;
  private seen = new Set<string>();

  constructor(opts: TwilioSmsAdapterOptions) {
    if (!opts.tenant_id?.trim()) throw new AdapterConfigError('twilio-sms', 'tenant_id is required');
    if (!opts.accountSid?.trim()) throw new AdapterConfigError('twilio-sms', 'accountSid is required');
    if (!opts.authToken?.trim()) throw new AdapterConfigError('twilio-sms', 'authToken is required');
    assertE164('fromNumber', opts.fromNumber);

    this.tenantId = opts.tenant_id;
    this.accountSid = opts.accountSid;
    this.fromNumber = opts.fromNumber;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.mode = opts.mode ?? 'poll';
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[twilio-sms:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[twilio-sms:${this.tenantId}] ${m}`),
    };
    // Basic auth: base64(accountSid:authToken)
    this.authHeader = 'Basic ' + Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64');
  }

  // -------------------------------------------------------------------------
  // ChannelAdapter contract
  // -------------------------------------------------------------------------

  async start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void> {
    if (this.polling) return;
    this.onInbound = onInbound;
    this.polling = true;
    this.stopRequested = false;
    if (this.mode === 'poll' && !this.manualPolling) {
      this.loopPromise = this.runLoop();
    }
    // In webhook mode, the caller mounts webhookHandler() on their HTTP server.
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
    assertE164('external_thread_id', out.external_thread_id);
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: this.fromNumber,
      To: out.external_thread_id,
      Body: out.text,
    });
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const data = (await res.json()) as TwilioSendResponse;
    if (!res.ok || data.error_code) {
      throw new Error(
        `Twilio SMS send failed: ${data.error_message ?? `HTTP ${res.status}`} (code ${data.error_code ?? res.status})`
      );
    }
    return { external_id: data.sid };
  }

  // -------------------------------------------------------------------------
  // Webhook handler
  // -------------------------------------------------------------------------

  /**
   * Returns an Express-compatible POST handler for Twilio webhooks.
   * Mount BEFORE this adapter is started; inbound will call onInbound.
   */
  webhookHandler(): WebhookHandler {
    return (req, res) => {
      const body = req.body;
      const sid = body['MessageSid'];
      const from = body['From'];
      const to = body['To'];
      const text = body['Body'] ?? '';

      if (!sid || !from) {
        res.sendStatus(400);
        return;
      }

      if (this.onInbound && !this.seen.has(sid)) {
        this.seen.add(sid);
        const inbound: InboundMessage = {
          id: sid,
          channel: 'twilio-sms',
          tenant_id: this.tenantId,
          external_thread_id: from,
          external_user_id: from,
          text,
          received_at: new Date().toISOString(),
          raw: body,
        };
        // Fire-and-forget (webhook needs quick 200 response)
        this.onInbound(inbound).catch(err =>
          this.log.error(`webhookHandler onInbound error: ${(err as Error).message}`)
        );
      }

      res.sendStatus(204);
    };
  }

  // -------------------------------------------------------------------------
  // Test / advanced surface
  // -------------------------------------------------------------------------

  async pollOnce(): Promise<number> {
    if (!this.onInbound) throw new Error('pollOnce: call start() first');

    const url =
      `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json` +
      `?To=${encodeURIComponent(this.fromNumber)}&PageSize=50`;

    let data: TwilioMessagesList;
    try {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: this.authHeader },
      });
      data = (await res.json()) as TwilioMessagesList;
    } catch (err) {
      this.log.error(`pollOnce error: ${(err as Error).message}`);
      return 0;
    }

    let delivered = 0;
    for (const m of data.messages ?? []) {
      if (m.direction !== 'inbound') continue;
      if (this.seen.has(m.sid)) continue;
      this.seen.add(m.sid);
      const inbound: InboundMessage = {
        id: m.sid,
        channel: 'twilio-sms',
        tenant_id: this.tenantId,
        external_thread_id: m.from,
        external_user_id: m.from,
        text: m.body,
        received_at: new Date(m.date_created).toISOString(),
        raw: m,
      };
      try {
        await this.onInbound(inbound);
        delivered++;
      } catch (err) {
        this.log.error(`onInbound error: ${(err as Error).message}`);
      }
    }

    if (this.seen.size > 10_000) {
      const arr = [...this.seen];
      this.seen = new Set(arr.slice(arr.length - 5_000));
    }

    return delivered;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

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
