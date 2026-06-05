/**
 * @penelope/adapters — adapter registry.
 *
 * Takes a tenant config + secrets map and instantiates the right adapters
 * for the tenant's enabled channels.
 *
 * Usage:
 *   const registry = new AdapterRegistry(tenantConfig, secrets);
 *   const adapters = registry.build();
 *   for (const adapter of adapters) {
 *     await adapter.start(onInbound);
 *   }
 */

import type { ChannelAdapter } from './types.js';
import { TelegramOwnerAdapter, type TelegramOwnerAdapterOptions } from './telegram-owner.js';
import { FbPageAdapter, type FbPageAdapterOptions } from './fb-page.js';
import { TwilioSmsAdapter, type TwilioSmsAdapterOptions } from './twilio-sms.js';
import { ImapSmtpAdapter, type ImapSmtpAdapterOptions } from './imap-smtp.js';
import { InstagramAdapter, type InstagramAdapterOptions } from './instagram.js';
import { LoomA2aAdapter, type LoomA2aAdapterOptions } from './loom-a2a.js';
import { WhatsappBusinessAdapter, type WhatsappBusinessAdapterOptions } from './whatsapp-business.js';

// ---------------------------------------------------------------------------
// Channel config shapes
// ---------------------------------------------------------------------------

export interface TelegramChannelConfig {
  enabled: boolean;
  bot_token: string;
  chat_id_allowlist: (string | number)[];
  poll_interval_ms?: number;
  long_poll_timeout_sec?: number;
  offset_state_path?: string;
}

export interface FbPageChannelConfig {
  enabled: boolean;
  page_id: string;
  page_token: string;
  graph_version?: string;
  window_mode?: 'enforce' | 'warn' | 'off';
  poll_interval_ms?: number;
}

export interface TwilioSmsChannelConfig {
  enabled: boolean;
  account_sid: string;
  auth_token: string;
  from_number: string;
  mode?: 'poll' | 'webhook';
  poll_interval_ms?: number;
}

export interface EmailChannelConfig {
  enabled: boolean;
  imap_host: string;
  imap_port?: number;
  imap_secure?: boolean;
  smtp_host: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  username: string;
  auth_type?: 'app_password' | 'oauth2';
  password?: string;
  oauth2?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
    expires?: number;
  };
  mailbox?: string;
  from_address?: string;
  poll_interval_ms?: number;
}

export interface InstagramChannelConfig {
  enabled: boolean;
  ig_user_id: string;
  page_token: string;
  graph_version?: string;
  poll_interval_ms?: number;
}

export interface LoomA2aChannelConfig {
  enabled: boolean;
  agent_id: string;
  bus_db_path?: string;
  poll_interval_ms?: number;
}

export interface WhatsappBusinessChannelConfig {
  enabled: boolean;
  phone_number_id: string;
  business_account_id: string;
  permanent_access_token: string;
  graph_version?: string;
  window_mode?: 'enforce' | 'warn' | 'off';
  webhook_secret?: string;
  poll_interval_ms?: number;
}

export interface TenantChannelConfig {
  telegram?: TelegramChannelConfig;
  'fb-page'?: FbPageChannelConfig;
  'twilio-sms'?: TwilioSmsChannelConfig;
  email?: EmailChannelConfig;
  instagram?: InstagramChannelConfig;
  'loom-a2a'?: LoomA2aChannelConfig;
  'whatsapp-business'?: WhatsappBusinessChannelConfig;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface RegistryOptions {
  /** Logger passed to every adapter. */
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
}

export class AdapterRegistry {
  private readonly tenantId: string;
  private readonly config: TenantChannelConfig;
  private readonly opts: RegistryOptions;

  constructor(tenantId: string, config: TenantChannelConfig, opts: RegistryOptions = {}) {
    if (!tenantId?.trim()) throw new Error('AdapterRegistry: tenantId is required');
    this.tenantId = tenantId;
    this.config = config;
    this.opts = opts;
  }

  /**
   * Instantiate and return all enabled channel adapters for this tenant.
   * Throws on invalid credentials. Disabled channels are skipped silently.
   */
  build(): ChannelAdapter[] {
    const adapters: ChannelAdapter[] = [];

    if (this.config.telegram?.enabled) {
      adapters.push(this.buildTelegram(this.config.telegram));
    }

    if (this.config['fb-page']?.enabled) {
      adapters.push(this.buildFbPage(this.config['fb-page']));
    }

    if (this.config['twilio-sms']?.enabled) {
      adapters.push(this.buildTwilioSms(this.config['twilio-sms']));
    }

    if (this.config.email?.enabled) {
      adapters.push(this.buildEmail(this.config.email));
    }

    if (this.config.instagram?.enabled) {
      adapters.push(this.buildInstagram(this.config.instagram));
    }

    if (this.config['loom-a2a']?.enabled) {
      adapters.push(this.buildLoomA2a(this.config['loom-a2a']));
    }

    if (this.config['whatsapp-business']?.enabled) {
      adapters.push(this.buildWhatsappBusiness(this.config['whatsapp-business']));
    }

    return adapters;
  }

  // -------------------------------------------------------------------------
  // Builders
  // -------------------------------------------------------------------------

  private buildTelegram(cfg: TelegramChannelConfig): TelegramOwnerAdapter {
    return new TelegramOwnerAdapter({
      tenant_id: this.tenantId,
      botToken: cfg.bot_token,
      chatIdAllowlist: cfg.chat_id_allowlist,
      pollIntervalMs: cfg.poll_interval_ms,
      longPollTimeoutSec: cfg.long_poll_timeout_sec,
      offsetStatePath: cfg.offset_state_path,
      logger: this.opts.logger,
    } satisfies TelegramOwnerAdapterOptions);
  }

  private buildFbPage(cfg: FbPageChannelConfig): FbPageAdapter {
    return new FbPageAdapter({
      tenant_id: this.tenantId,
      page_id: cfg.page_id,
      page_token: cfg.page_token,
      graph_version: cfg.graph_version,
      window_mode: cfg.window_mode,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies FbPageAdapterOptions);
  }

  private buildTwilioSms(cfg: TwilioSmsChannelConfig): TwilioSmsAdapter {
    return new TwilioSmsAdapter({
      tenant_id: this.tenantId,
      accountSid: cfg.account_sid,
      authToken: cfg.auth_token,
      fromNumber: cfg.from_number,
      mode: cfg.mode,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies TwilioSmsAdapterOptions);
  }

  private buildEmail(cfg: EmailChannelConfig): ImapSmtpAdapter {
    return new ImapSmtpAdapter({
      tenant_id: this.tenantId,
      imap_host: cfg.imap_host,
      imap_port: cfg.imap_port,
      imap_secure: cfg.imap_secure,
      smtp_host: cfg.smtp_host,
      smtp_port: cfg.smtp_port,
      smtp_secure: cfg.smtp_secure,
      username: cfg.username,
      auth_type: cfg.auth_type,
      password: cfg.password,
      oauth2: cfg.oauth2,
      mailbox: cfg.mailbox,
      from_address: cfg.from_address,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies ImapSmtpAdapterOptions);
  }

  private buildInstagram(cfg: InstagramChannelConfig): InstagramAdapter {
    return new InstagramAdapter({
      tenant_id: this.tenantId,
      ig_user_id: cfg.ig_user_id,
      page_token: cfg.page_token,
      graph_version: cfg.graph_version,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies InstagramAdapterOptions);
  }

  private buildLoomA2a(cfg: LoomA2aChannelConfig): LoomA2aAdapter {
    return new LoomA2aAdapter({
      tenant_id: this.tenantId,
      agent_id: cfg.agent_id,
      bus_db_path: cfg.bus_db_path,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies LoomA2aAdapterOptions);
  }

  private buildWhatsappBusiness(cfg: WhatsappBusinessChannelConfig): WhatsappBusinessAdapter {
    return new WhatsappBusinessAdapter({
      tenant_id: this.tenantId,
      phone_number_id: cfg.phone_number_id,
      business_account_id: cfg.business_account_id,
      permanent_access_token: cfg.permanent_access_token,
      graph_version: cfg.graph_version,
      window_mode: cfg.window_mode,
      webhook_secret: cfg.webhook_secret,
      pollIntervalMs: cfg.poll_interval_ms,
      logger: this.opts.logger,
    } satisfies WhatsappBusinessAdapterOptions);
  }
}
