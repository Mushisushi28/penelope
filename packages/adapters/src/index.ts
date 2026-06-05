/**
 * @penelope/adapters — public API
 */

// Types
export type {
  Attachment,
  AttachmentKind,
  InboundMessage,
  OutboundMessage,
  ChannelAdapter,
} from './types.js';
export { WindowExpiredError, AdapterConfigError } from './types.js';

// Telegram (owner-facing)
export { TelegramOwnerAdapter } from './telegram-owner.js';
export type { TelegramOwnerAdapterOptions } from './telegram-owner.js';

// Facebook Page Messenger
export { FbPageAdapter, lastCustomerMessageMs, withinMessengerWindow } from './fb-page.js';
export type { FbPageAdapterOptions } from './fb-page.js';

// Twilio SMS
export { TwilioSmsAdapter, isValidE164, assertE164 } from './twilio-sms.js';
export type { TwilioSmsAdapterOptions, WebhookHandler } from './twilio-sms.js';

// IMAP / SMTP Email
export { ImapSmtpAdapter } from './imap-smtp.js';
export type { ImapSmtpAdapterOptions } from './imap-smtp.js';

// Instagram DM (stub)
export { InstagramAdapter } from './instagram.js';
export type { InstagramAdapterOptions } from './instagram.js';

// Loom A2A bus
export { LoomA2aAdapter } from './loom-a2a.js';
export type { LoomA2aAdapterOptions } from './loom-a2a.js';

// WhatsApp Business Cloud API
export { WhatsappBusinessAdapter, withinWhatsappWindow, verifyWebhookSignature } from './whatsapp-business.js';
export type {
  WhatsappBusinessAdapterOptions,
  WaTemplate,
  WaTemplateComponent,
  WaTemplateParam,
  WaMessageStatus,
  WebhookRequest,
  WebhookResponse,
} from './whatsapp-business.js';

// Registry
export { AdapterRegistry } from './registry.js';
export type {
  TenantChannelConfig,
  TelegramChannelConfig,
  FbPageChannelConfig,
  TwilioSmsChannelConfig,
  EmailChannelConfig,
  InstagramChannelConfig,
  LoomA2aChannelConfig,
  WhatsappBusinessChannelConfig,
  RegistryOptions,
} from './registry.js';
