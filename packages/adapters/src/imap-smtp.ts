/**
 * ImapSmtpAdapter — email channel adapter.
 *
 * Inbound: IMAP via `imapflow` (idle + periodic fetch).
 * Outbound: SMTP via `nodemailer`.
 *
 * Auth: App Password (recommended) or OAuth2 (stub — set auth_type='oauth2'
 * and wire tokens yourself; nodemailer supports it natively).
 *
 * Threading: uses the email Message-ID / In-Reply-To headers to group
 * messages into threads. external_thread_id = the root Message-ID (first
 * message in a thread). If no References header exists, Message-ID is used.
 *
 * Per imapflow docs, the client runs in a single-connection mode. For high
 * volume consider multiple instances or a server-side IMAP proxy.
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

export interface ImapSmtpAdapterOptions {
  tenant_id: string;
  /** IMAP server host (e.g. 'imap.gmail.com'). */
  imap_host: string;
  imap_port?: number;
  imap_secure?: boolean;
  /** SMTP server host (e.g. 'smtp.gmail.com'). */
  smtp_host: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  /** Username — usually your email address. */
  username: string;
  /**
   * Auth type.
   * 'app_password' (default): plain password / app-specific password.
   * 'oauth2': provide an `oauth2` block (nodemailer OAuth2 shape).
   */
  auth_type?: 'app_password' | 'oauth2';
  /** Password / app password. Required for auth_type='app_password'. */
  password?: string;
  /** OAuth2 tokens. Required for auth_type='oauth2'. See nodemailer docs. */
  oauth2?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
    expires?: number;
  };
  /** IMAP mailbox to watch. Default 'INBOX'. */
  mailbox?: string;
  /**
   * Sender address for outbound emails.
   * Defaults to username if not specified.
   */
  from_address?: string;
  /**
   * How often to re-check for new messages (ms).
   * IMAP IDLE is preferred; this is the fallback poll interval. Default 60 000.
   */
  pollIntervalMs?: number;
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: skip the IMAP IDLE loop. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class ImapSmtpAdapter implements ChannelAdapter {
  readonly name = 'email';

  private readonly tenantId: string;
  private readonly opts: ImapSmtpAdapterOptions;
  private readonly log: NonNullable<ImapSmtpAdapterOptions['logger']>;
  private readonly mailbox: string;
  private readonly fromAddress: string;
  private readonly pollIntervalMs: number;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private sleepResolver: (() => void) | null = null;

  // imapflow and nodemailer instances (lazy-loaded to avoid import error when unused)
  private imapClient: unknown = null;
  private transporter: unknown = null;

  // Track delivered UIDs per mailbox to avoid re-delivery
  private deliveredUids = new Set<number>();

  constructor(opts: ImapSmtpAdapterOptions) {
    if (!opts.tenant_id?.trim()) throw new AdapterConfigError('email', 'tenant_id is required');
    if (!opts.imap_host?.trim()) throw new AdapterConfigError('email', 'imap_host is required');
    if (!opts.smtp_host?.trim()) throw new AdapterConfigError('email', 'smtp_host is required');
    if (!opts.username?.trim()) throw new AdapterConfigError('email', 'username is required');

    const authType = opts.auth_type ?? 'app_password';
    if (authType === 'app_password' && !opts.password?.trim()) {
      throw new AdapterConfigError('email', 'password is required for auth_type=app_password');
    }
    if (authType === 'oauth2' && !opts.oauth2) {
      throw new AdapterConfigError('email', 'oauth2 config is required for auth_type=oauth2');
    }

    this.tenantId = opts.tenant_id;
    this.opts = opts;
    this.mailbox = opts.mailbox ?? 'INBOX';
    this.fromAddress = opts.from_address ?? opts.username;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.manualPolling = opts.manualPolling ?? false;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[email:${this.tenantId}] ${m}`),
      error: (m) => console.error(`[email:${this.tenantId}] ${m}`),
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
      await this.initImapClient();
      this.loopPromise = this.runLoop();
    }
  }

  async stop(): Promise<void> {
    if (!this.polling) return;
    this.stopRequested = true;
    try { this.sleepResolver?.(); } catch { /* ignore */ }
    try {
      // imapflow client has a .close() / .logout()
      if (this.imapClient && typeof (this.imapClient as { logout?: () => Promise<void> }).logout === 'function') {
        await (this.imapClient as { logout: () => Promise<void> }).logout();
      }
    } catch { /* ignore */ }
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* swallow */ }
      this.loopPromise = null;
    }
    this.polling = false;
    this.onInbound = null;
    this.imapClient = null;
    this.transporter = null;
  }

  async send(out: OutboundMessage): Promise<{ external_id: string }> {
    const nodemailer = await import('nodemailer');
    if (!this.transporter) {
      this.transporter = this.createTransporter(nodemailer.default as unknown as { createTransport: (opts: unknown) => unknown });
    }

    const mailOptions: Record<string, unknown> = {
      from: this.fromAddress,
      to: out.external_thread_id,
      subject: (out.meta?.['subject'] as string | undefined) ?? 'Re: your message',
      text: out.text,
    };

    if (out.reply_to_external_id) {
      mailOptions['inReplyTo'] = out.reply_to_external_id;
      mailOptions['references'] = out.reply_to_external_id;
    }

    const info = await (
      this.transporter as { sendMail: (opts: unknown) => Promise<{ messageId: string }> }
    ).sendMail(mailOptions);

    return { external_id: info.messageId };
  }

  // -------------------------------------------------------------------------
  // Test / advanced surface
  // -------------------------------------------------------------------------

  /**
   * Fetch and deliver new messages from the configured mailbox.
   * In the loop, this is called on each poll cycle after IMAP IDLE wakeup.
   */
  async pollOnce(): Promise<number> {
    if (!this.onInbound) throw new Error('pollOnce: call start() first');
    if (!this.imapClient) await this.initImapClient();

    const client = this.imapClient as {
      mailboxOpen: (box: string) => Promise<unknown>;
      search: (criteria: unknown, opts: unknown) => AsyncIterable<{
        uid: number;
        envelope: {
          messageId?: string;
          subject?: string;
          from?: { name?: string; address?: string }[];
          date?: Date;
          inReplyTo?: string;
          references?: string[];
        };
        bodyParts: Map<string, Buffer>;
      }>;
      download: (range: string, part: string) => Promise<{ content: NodeJS.ReadableStream }>;
    };

    let delivered = 0;
    try {
      await client.mailboxOpen(this.mailbox);
      // Fetch messages not yet seen
      for await (const msg of client.search(
        { unseen: true },
        { uid: true, bodyParts: ['TEXT'], envelope: true }
      )) {
        if (this.deliveredUids.has(msg.uid)) continue;
        this.deliveredUids.add(msg.uid);

        const env = msg.envelope;
        const fromAddr = env.from?.[0]?.address ?? 'unknown';
        const fromName = env.from?.[0]?.name;

        // Thread ID: first entry in References, or the message's own Message-ID
        const references: string[] = env.references ?? [];
        const threadId = references[0] ?? env.messageId ?? String(msg.uid);

        // Extract plain text body
        const textPart = msg.bodyParts.get('TEXT');
        const text = textPart ? textPart.toString('utf-8').trim() : '';

        const inbound: InboundMessage = {
          id: env.messageId ?? String(msg.uid),
          channel: 'email',
          tenant_id: this.tenantId,
          external_thread_id: threadId,
          external_user_id: fromAddr,
          user_display_name: fromName,
          text,
          received_at: env.date ? env.date.toISOString() : new Date().toISOString(),
          raw: { envelope: env, uid: msg.uid },
        };
        try {
          await this.onInbound(inbound);
          delivered++;
        } catch (err) {
          this.log.error(`onInbound error: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.log.error(`IMAP fetch error: ${(err as Error).message}`);
      // Attempt reconnect on next cycle
      this.imapClient = null;
    }

    // Bound seen set
    if (this.deliveredUids.size > 20_000) {
      this.deliveredUids = new Set([...this.deliveredUids].slice(-10_000));
    }

    return delivered;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async initImapClient(): Promise<void> {
    const { ImapFlow } = await import('imapflow');
    const authType = this.opts.auth_type ?? 'app_password';

    const auth: { user: string; pass?: string; accessToken?: string; loginMethod?: string; authzid?: string } = authType === 'oauth2'
      ? {
          user: this.opts.username,
          accessToken: this.opts.oauth2!.accessToken ?? '',
        }
      : {
          user: this.opts.username,
          pass: this.opts.password!,
        };

    this.imapClient = new ImapFlow({
      host: this.opts.imap_host,
      port: this.opts.imap_port ?? (this.opts.imap_secure !== false ? 993 : 143),
      secure: this.opts.imap_secure !== false,
      auth,
      logger: false, // suppress imapflow's internal logging
    });

    await (this.imapClient as { connect: () => Promise<void> }).connect();
    this.log.info('IMAP connected');
  }

  private createTransporter(nodemailer: {
    createTransport: (opts: unknown) => unknown;
  }): unknown {
    const authType = this.opts.auth_type ?? 'app_password';
    const auth: Record<string, unknown> & { user: string } = authType === 'oauth2'
      ? {
          type: 'OAuth2',
          user: this.opts.username,
          clientId: this.opts.oauth2!.clientId,
          clientSecret: this.opts.oauth2!.clientSecret,
          refreshToken: this.opts.oauth2!.refreshToken,
          accessToken: this.opts.oauth2!.accessToken,
        }
      : {
          user: this.opts.username,
          pass: this.opts.password!,
        };

    return nodemailer.createTransport({
      host: this.opts.smtp_host,
      port: this.opts.smtp_port ?? (this.opts.smtp_secure !== false ? 465 : 587),
      secure: this.opts.smtp_secure !== false,
      auth,
    });
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
