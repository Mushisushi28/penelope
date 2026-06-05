/**
 * TelegramOwnerAdapter — owner-facing Telegram channel adapter.
 *
 * Vendored and generalised from loom/src/channels/TelegramChannelAdapter.ts.
 * Key differences from the loom original:
 *   - Per-tenant bot token and allowlist (no LOOM_INSTANCE paths)
 *   - Implements the Penelope ChannelAdapter interface (send + edit + react)
 *   - No loom bus coupling — emits InboundMessage directly to onInbound
 *   - Pluggable logger (defaults to console)
 *   - Offset persisted in-memory only (tenant chooses persistence strategy)
 *
 * Network model: long-polling against Telegram Bot API `getUpdates`.
 * No external HTTP libraries — Node native fetch (Node >= 20).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from './types.js';
import { AdapterConfigError } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TelegramOwnerAdapterOptions {
  /** Penelope tenant id — stamped on every InboundMessage. */
  tenant_id: string;
  /** Telegram bot token from @BotFather. Required. */
  botToken: string;
  /**
   * Allowlist of accepted chat_ids. Inbound from any other chat is dropped.
   * Empty list means deny-everything (explicit by design).
   */
  chatIdAllowlist: ReadonlyArray<string | number>;
  /** Interval between poll cycles in ms. Default 1000ms. */
  pollIntervalMs?: number;
  /** `timeout` query param for getUpdates (seconds). Telegram caps at 50. */
  longPollTimeoutSec?: number;
  /**
   * Path to persist the getUpdates offset between process restarts.
   * If omitted, offset is kept in-memory only.
   */
  offsetStatePath?: string;
  /** Pluggable logger. Default: console. */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Test seam: replace globalThis.fetch. */
  fetchImpl?: (url: string, init?: { signal?: AbortSignal }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
  /** Test seam: skip the polling loop. Call pollOnce() manually. */
  manualPolling?: boolean;
}

// ---------------------------------------------------------------------------
// Telegram API shapes — only the bits we read
// ---------------------------------------------------------------------------

interface TgChat { id: number; type: string; username?: string; title?: string }
interface TgFrom { id: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string }
interface TgWebAppData { data: string; button_text: string }
interface TgPhotoSize { file_id: string; width: number; height: number; file_size?: number }
interface TgDocument { file_id: string; file_name?: string; mime_type?: string; file_size?: number }
interface TgAudio { file_id: string; mime_type?: string; duration?: number }
interface TgVideo { file_id: string; mime_type?: string; duration?: number }
interface TgVoice { file_id: string; mime_type?: string; duration?: number }

interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgFrom;
  date: number;
  text?: string;
  caption?: string;
  web_app_data?: TgWebAppData;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  audio?: TgAudio;
  video?: TgVideo;
  voice?: TgVoice;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
}

interface TgGetUpdatesResponse {
  ok: boolean;
  result?: TgUpdate[];
  description?: string;
}

interface TgSendMessageResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_LONG_POLL_TIMEOUT_SEC = 25;

export class TelegramOwnerAdapter implements ChannelAdapter {
  readonly name = 'telegram';

  private readonly tenantId: string;
  private readonly botToken: string;
  private readonly allowlist: Set<string>;
  private readonly pollIntervalMs: number;
  private readonly longPollTimeoutSec: number;
  private readonly offsetStatePath: string | null;
  private readonly log: NonNullable<TelegramOwnerAdapterOptions['logger']>;
  private readonly fetchImpl: NonNullable<TelegramOwnerAdapterOptions['fetchImpl']>;
  private readonly manualPolling: boolean;

  private onInbound: ((msg: InboundMessage) => Promise<void>) | null = null;
  private polling = false;
  private stopRequested = false;
  private currentAbort: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private offset = 0;
  private sleepResolver: (() => void) | null = null;

  constructor(opts: TelegramOwnerAdapterOptions) {
    if (!opts.botToken?.trim()) {
      throw new AdapterConfigError('telegram', 'botToken is required');
    }
    if (!opts.tenant_id?.trim()) {
      throw new AdapterConfigError('telegram', 'tenant_id is required');
    }
    this.tenantId = opts.tenant_id;
    this.botToken = opts.botToken;
    this.allowlist = new Set(opts.chatIdAllowlist.map(id => String(id)));
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.longPollTimeoutSec = opts.longPollTimeoutSec ?? DEFAULT_LONG_POLL_TIMEOUT_SEC;
    this.offsetStatePath = opts.offsetStatePath ?? null;
    this.log = opts.logger ?? {
      info: (msg) => console.info(`[telegram:${this.tenantId}] ${msg}`),
      error: (msg) => console.error(`[telegram:${this.tenantId}] ${msg}`),
    };
    this.fetchImpl =
      opts.fetchImpl ??
      ((url, init) =>
        (globalThis.fetch as (u: string, i?: unknown) => Promise<Response>)(url, init) as unknown as ReturnType<
          NonNullable<TelegramOwnerAdapterOptions['fetchImpl']>
        >);
    this.manualPolling = opts.manualPolling ?? false;
  }

  // -------------------------------------------------------------------------
  // ChannelAdapter contract
  // -------------------------------------------------------------------------

  async start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void> {
    if (this.polling) return;
    this.onInbound = onInbound;
    this.offset = this.offsetStatePath ? readOffset(this.offsetStatePath) : 0;
    this.polling = true;
    this.stopRequested = false;
    if (!this.manualPolling) {
      this.loopPromise = this.runLoop();
    }
  }

  async stop(): Promise<void> {
    if (!this.polling) return;
    this.stopRequested = true;
    try { this.currentAbort?.abort(); } catch { /* ignore */ }
    try { this.sleepResolver?.(); } catch { /* ignore */ }
    if (this.loopPromise) {
      try { await this.loopPromise; } catch { /* loop swallows */ }
      this.loopPromise = null;
    }
    this.polling = false;
    this.onInbound = null;
  }

  async send(out: OutboundMessage): Promise<{ external_id: string }> {
    const url = this.apiUrl('sendMessage');
    const body: Record<string, unknown> = {
      chat_id: out.external_thread_id,
      text: out.text,
    };
    if (out.reply_to_external_id) {
      body['reply_to_message_id'] = parseInt(out.reply_to_external_id, 10);
    }
    const res = await this.fetchImpl(url, {
      // fetchImpl accepts the same narrow signature; for POST we need
      // a real fetch. Cast to any to attach method/headers/body.
    } as never);
    // Use native fetch directly for POST (the seam is GET-only for tests)
    const postRes = await (globalThis.fetch as typeof fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!postRes.ok) {
      const txt = await postRes.text();
      throw new Error(`telegram sendMessage HTTP ${postRes.status}: ${txt}`);
    }
    const data = (await postRes.json()) as TgSendMessageResponse;
    if (!data.ok || !data.result) {
      throw new Error(`telegram sendMessage not-ok: ${data.description ?? '(no description)'}`);
    }
    return { external_id: String(data.result.message_id) };
  }

  async edit(external_id: string, newText: string): Promise<void> {
    // chat_id not available without context; callers must pass via meta or
    // use a custom wrapper. For owner-bot scenarios the chat_id is the allowlisted
    // chat — expose a helper for direct use.
    throw new Error(
      'TelegramOwnerAdapter.edit() requires chat_id. Use editInChat(chat_id, message_id, text) instead.'
    );
  }

  async editInChat(chatId: string | number, messageId: string | number, newText: string): Promise<void> {
    const res = await (globalThis.fetch as typeof fetch)(this.apiUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: newText }),
    });
    if (!res.ok) throw new Error(`telegram editMessageText HTTP ${res.status}`);
  }

  async react(external_id: string, emoji: string): Promise<void> {
    // Telegram Bot API reaction: setMessageReaction (Bot API 7.0+)
    // chat_id not included in external_id; same limitation as edit().
    throw new Error(
      'TelegramOwnerAdapter.react() requires chat_id. Use reactInChat(chat_id, message_id, emoji) instead.'
    );
  }

  async reactInChat(chatId: string | number, messageId: string | number, emoji: string): Promise<void> {
    // setMessageReaction is available in Bot API >= 7.0 (2024)
    const res = await (globalThis.fetch as typeof fetch)(this.apiUrl('setMessageReaction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
      }),
    });
    if (!res.ok) throw new Error(`telegram setMessageReaction HTTP ${res.status}`);
  }

  // -------------------------------------------------------------------------
  // Test / advanced surface
  // -------------------------------------------------------------------------

  /**
   * Single long-poll iteration. Call manually when manualPolling is true.
   * Returns number of messages delivered to onInbound.
   */
  async pollOnce(): Promise<number> {
    if (!this.onInbound) throw new Error('pollOnce: call start() first');
    const updates = await this.fetchUpdates();
    let delivered = 0;
    for (const upd of updates) {
      const msg =
        upd.message ?? upd.edited_message ?? upd.channel_post ?? upd.edited_channel_post;
      if (!msg) {
        this.offset = Math.max(this.offset, upd.update_id + 1);
        continue;
      }
      const chatIdStr = String(msg.chat.id);
      if (!this.allowlist.has(chatIdStr)) {
        this.offset = Math.max(this.offset, upd.update_id + 1);
        continue;
      }

      const inbound = this.normalise(upd.update_id, msg, chatIdStr);
      if (!inbound) {
        this.offset = Math.max(this.offset, upd.update_id + 1);
        continue;
      }
      try {
        await this.onInbound(inbound);
        delivered += 1;
      } catch (err) {
        this.log.error(`onInbound failed: ${(err as Error).message}`);
      }
      this.offset = Math.max(this.offset, upd.update_id + 1);
    }
    if (this.offsetStatePath) persistOffset(this.offsetStatePath, this.offset);
    return delivered;
  }

  get currentOffset(): number { return this.offset; }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private normalise(updateId: number, msg: TgMessage, chatIdStr: string): InboundMessage | null {
    const meta: Record<string, unknown> = {
      telegram_update_id: updateId,
      telegram_message_id: msg.message_id,
      telegram_chat_id: chatIdStr,
      telegram_chat_type: msg.chat.type,
      telegram_from_user_id: msg.from?.id ?? null,
      telegram_from_username: msg.from?.username ?? null,
    };

    // web_app_data (Mini App callback)
    if (msg.web_app_data) {
      return {
        id: String(updateId),
        channel: 'telegram',
        tenant_id: this.tenantId,
        external_thread_id: chatIdStr,
        external_user_id: chatIdStr,
        user_display_name: msg.from?.first_name ?? undefined,
        text: msg.web_app_data.data,
        received_at: new Date(msg.date * 1000).toISOString(),
        raw: msg,
        attachments: [{
          kind: 'web_app_data',
          external_id: msg.web_app_data.button_text,
        }],
      };
    }

    // Text / caption
    const text = (msg.text ?? msg.caption ?? '').trim();

    // Build attachments list
    const attachments = buildAttachments(msg);

    if (!text && attachments.length === 0) return null;

    return {
      id: String(updateId),
      channel: 'telegram',
      tenant_id: this.tenantId,
      external_thread_id: chatIdStr,
      external_user_id: chatIdStr,
      user_display_name: msg.from
        ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username
        : undefined,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      received_at: new Date(msg.date * 1000).toISOString(),
      raw: msg,
    };
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

  private async fetchUpdates(): Promise<TgUpdate[]> {
    const url =
      `https://api.telegram.org/bot${encodeURIComponent(this.botToken)}/getUpdates` +
      `?offset=${this.offset}&timeout=${this.longPollTimeoutSec}`;
    const ac = new AbortController();
    this.currentAbort = ac;
    try {
      const res = await this.fetchImpl(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`getUpdates HTTP ${res.status} ${res.statusText}`);
      const body = (await res.json()) as TgGetUpdatesResponse;
      if (!body.ok) throw new Error(`getUpdates not-ok: ${body.description ?? '(no description)'}`);
      return Array.isArray(body.result) ? body.result : [];
    } finally {
      this.currentAbort = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const wake = () => resolve();
      const t = setTimeout(wake, ms);
      this.sleepResolver = () => { clearTimeout(t); wake(); };
    });
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${encodeURIComponent(this.botToken)}/${method}`;
  }
}

// ---------------------------------------------------------------------------
// Attachment builder
// ---------------------------------------------------------------------------

function buildAttachments(msg: TgMessage) {
  const out: import('./types.js').Attachment[] = [];
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    if (largest) {
      out.push({ kind: 'image', external_id: largest.file_id });
    }
  }
  if (msg.document) {
    out.push({
      kind: 'document',
      external_id: msg.document.file_id,
      filename: msg.document.file_name,
      mime_type: msg.document.mime_type,
    });
  }
  if (msg.audio) out.push({ kind: 'audio', external_id: msg.audio.file_id, mime_type: msg.audio.mime_type });
  if (msg.video) out.push({ kind: 'video', external_id: msg.video.file_id, mime_type: msg.video.mime_type });
  if (msg.voice) out.push({ kind: 'audio', external_id: msg.voice.file_id, mime_type: msg.voice.mime_type });
  return out;
}

// ---------------------------------------------------------------------------
// Offset persistence
// ---------------------------------------------------------------------------

function readOffset(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { offset?: number };
    return typeof parsed.offset === 'number' && Number.isFinite(parsed.offset) ? parsed.offset : 0;
  } catch { return 0; }
}

function persistOffset(path: string, offset: number): void {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
  try {
    writeFileSync(path, JSON.stringify({ offset, updated_at: new Date().toISOString() }), 'utf-8');
  } catch (err) {
    console.error(`[telegram] failed to persist offset: ${(err as Error).message}`);
  }
}
