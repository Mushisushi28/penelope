/**
 * @penelope/adapters — shared types
 *
 * These interfaces are the contract between Penelope's core routing engine
 * and any channel (Telegram, FB Messenger, Twilio SMS, email, etc.).
 * Keep this file dependency-free — it is imported by both the adapter
 * implementations and by @penelope/core.
 */

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'web_app_data'
  | string;

export interface Attachment {
  kind: AttachmentKind;
  /** MIME type when known (e.g. "image/jpeg"). */
  mime_type?: string;
  /** Original filename when known. */
  filename?: string;
  /**
   * Channel-specific ID that can be used to fetch the attachment later
   * (e.g. Telegram file_id, FB attachment_id).
   */
  external_id?: string;
  /** Pre-resolved public URL, when available. */
  url?: string;
  /** Raw bytes — only populated when the adapter has already fetched. */
  data?: Buffer;
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

/**
 * Normalised inbound message from any channel.
 * Adapters MUST populate: id, channel, tenant_id, external_thread_id,
 * external_user_id, text, received_at.
 * All other fields are best-effort.
 */
export interface InboundMessage {
  /** Unique message ID within this channel (e.g. Telegram update_id). */
  id: string;
  /** Channel name: 'telegram' | 'fb-page' | 'twilio-sms' | 'email' | etc. */
  channel: string;
  /** Penelope tenant identifier. */
  tenant_id: string;
  /**
   * Thread / conversation identifier within this channel.
   * For Telegram: chat_id. For FB: PSID. For SMS: E.164 number. For email: thread-id.
   */
  external_thread_id: string;
  /**
   * The end-user's identifier on this channel.
   * Often the same as external_thread_id for 1-1 channels (SMS, DM).
   */
  external_user_id: string;
  /** Human-readable display name if the channel provides one. */
  user_display_name?: string;
  /** Normalised text body. Empty string if this is an attachment-only message. */
  text: string;
  attachments?: Attachment[];
  /** ISO 8601 timestamp when the channel observed the inbound. */
  received_at: string;
  /**
   * Channel-specific raw payload. Useful for adapters that need fields
   * outside the normalised schema (e.g. Telegram message_id for replies).
   */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

export interface OutboundMessage {
  /** Penelope tenant identifier. */
  tenant_id: string;
  /** Channel name — must match the adapter's `name`. */
  channel: string;
  /**
   * Thread to reply into.
   * For Telegram: chat_id. For FB: PSID. For SMS: E.164 number. For email: message-id to reply to.
   */
  external_thread_id: string;
  /** Text body of the reply. */
  text: string;
  attachments?: Attachment[];
  /**
   * Optional: the external message ID to quote-reply (Telegram message_id,
   * FB message_id, email Message-ID header, etc.).
   */
  reply_to_external_id?: string;
  /** Pass-through metadata for channel-specific extensions. */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

/**
 * Every channel adapter implements this interface.
 *
 * Lifecycle:
 *   1. Instantiate with per-tenant credentials + config.
 *   2. `start(onInbound)` — begin polling/listening.
 *   3. Route inbound messages via the `onInbound` callback.
 *   4. `send(out)` — deliver outbound messages.
 *   5. `stop()` — clean shutdown. Idempotent.
 */
export interface ChannelAdapter {
  /** Canonical channel name — matches `InboundMessage.channel`. */
  readonly name: string;
  /**
   * Begin receiving. `onInbound` is the single hook through which all
   * inbound messages flow into Penelope's routing engine.
   * Implementations MUST NOT drop messages without calling onInbound
   * (except for explicitly filtered/blocked senders).
   */
  start(onInbound: (msg: InboundMessage) => Promise<void>): Promise<void>;
  /** Stop receiving. Idempotent. */
  stop(): Promise<void>;
  /**
   * Deliver an outbound message.
   * Returns the channel-assigned external ID (message_id, delivery receipt, etc.)
   */
  send(out: OutboundMessage): Promise<{ external_id: string }>;
  /**
   * Edit a previously sent message.
   * Optional — channels that don't support edit may leave this undefined.
   */
  edit?(external_id: string, newText: string): Promise<void>;
  /**
   * React to a message with an emoji.
   * Optional — channels that don't support reactions may leave this undefined.
   */
  react?(external_id: string, emoji: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Thrown by send() when the channel's reply window has expired. */
export class WindowExpiredError extends Error {
  constructor(message = 'Reply window expired for this thread') {
    super(message);
    this.name = 'WindowExpiredError';
  }
}

/** Thrown when an adapter receives invalid/missing credentials. */
export class AdapterConfigError extends Error {
  constructor(adapterName: string, detail: string) {
    super(`[${adapterName}] Config error: ${detail}`);
    this.name = 'AdapterConfigError';
  }
}
