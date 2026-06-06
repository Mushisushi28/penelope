/**
 * ChannelAdapter interface compliance tests.
 *
 * Verifies that every adapter correctly implements the ChannelAdapter contract:
 *   - channel_id is set
 *   - capabilities object is accurate
 *   - healthCheck() returns { ok: false } when credentials are invalid/missing
 *   - AdapterRegistry.getByChannelId() lookup works
 *
 * No real API calls are made — fetchImpl is always mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter, ChannelCapabilities } from '../types.js';
import { TelegramOwnerAdapter } from '../telegram-owner.js';
import { FbPageAdapter } from '../fb-page.js';
import { TwilioSmsAdapter } from '../twilio-sms.js';
import { InstagramAdapter } from '../instagram.js';
import { WhatsappBusinessAdapter } from '../whatsapp-business.js';
import { LoomA2aAdapter } from '../loom-a2a.js';
import { AdapterRegistry } from '../registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch that always returns a 401 response. */
function failFetch(): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ error: { message: 'mock auth failure' } }),
  }) as unknown as typeof globalThis.fetch;
}

/** Build a mock fetch that returns a 200 with a body. */
function okFetch(body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Interface compliance: all adapters satisfy ChannelAdapter
// ---------------------------------------------------------------------------

describe('ChannelAdapter interface compliance', () => {
  it('TelegramOwnerAdapter satisfies ChannelAdapter', () => {
    const adapter = new TelegramOwnerAdapter({
      tenant_id: 'test',
      botToken: 'test-token',
      chatIdAllowlist: [123],
      manualPolling: true,
    });
    // TypeScript already enforces this at compile time; runtime check:
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.stop).toBe('function');
    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.channel_id).toBe('string');
    expect(typeof adapter.capabilities).toBe('object');
  });

  it('FbPageAdapter satisfies ChannelAdapter', () => {
    const adapter = new FbPageAdapter({
      tenant_id: 'test',
      page_id: 'p1',
      page_token: 'tok',
      manualPolling: true,
    });
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.stop).toBe('function');
    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.channel_id).toBe('string');
    expect(typeof adapter.capabilities).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// channel_id values
// ---------------------------------------------------------------------------

describe('channel_id values', () => {
  it('TelegramOwnerAdapter has channel_id = "telegram"', () => {
    const a = new TelegramOwnerAdapter({
      tenant_id: 'test', botToken: 'x', chatIdAllowlist: [], manualPolling: true,
    });
    expect(a.channel_id).toBe('telegram');
  });

  it('FbPageAdapter has channel_id = "fb-page"', () => {
    const a = new FbPageAdapter({
      tenant_id: 'test', page_id: 'p', page_token: 't', manualPolling: true,
    });
    expect(a.channel_id).toBe('fb-page');
  });

  it('TwilioSmsAdapter has channel_id = "twilio-sms"', () => {
    const a = new TwilioSmsAdapter({
      tenant_id: 'test', accountSid: 'AC123', authToken: 'auth', fromNumber: '+15005550006', manualPolling: true,
    });
    expect(a.channel_id).toBe('twilio-sms');
  });

  it('InstagramAdapter has channel_id = "instagram"', () => {
    const a = new InstagramAdapter({
      tenant_id: 'test', ig_user_id: 'u1', page_token: 'tok', manualPolling: true,
    });
    expect(a.channel_id).toBe('instagram');
  });

  it('WhatsappBusinessAdapter has channel_id = "whatsapp-business"', () => {
    const a = new WhatsappBusinessAdapter({
      tenant_id: 'test',
      phone_number_id: 'pn1',
      business_account_id: 'ba1',
      permanent_access_token: 'pat',
      manualPolling: true,
    });
    expect(a.channel_id).toBe('whatsapp-business');
  });

  it('LoomA2aAdapter has channel_id = "loom-a2a"', () => {
    const a = new LoomA2aAdapter({
      tenant_id: 'test', agent_id: 'penelope', manualPolling: true,
    });
    expect(a.channel_id).toBe('loom-a2a');
  });
});

// ---------------------------------------------------------------------------
// Capabilities shape
// ---------------------------------------------------------------------------

describe('ChannelCapabilities shape', () => {
  const REQUIRED_KEYS: (keyof ChannelCapabilities)[] = [
    'send_text', 'send_attachments', 'reactions', 'thread_history',
    'polling_inbox', 'webhook_inbox', 'supports_typing_indicator',
  ];

  function assertCapabilities(adapter: ChannelAdapter) {
    for (const key of REQUIRED_KEYS) {
      expect(typeof adapter.capabilities[key]).toBe('boolean');
    }
  }

  it('TelegramOwnerAdapter capabilities are all booleans', () => {
    assertCapabilities(new TelegramOwnerAdapter({
      tenant_id: 't', botToken: 'b', chatIdAllowlist: [], manualPolling: true,
    }));
  });

  it('TelegramOwnerAdapter send_text is true', () => {
    const a = new TelegramOwnerAdapter({
      tenant_id: 't', botToken: 'b', chatIdAllowlist: [], manualPolling: true,
    });
    expect(a.capabilities.send_text).toBe(true);
  });

  it('FbPageAdapter capabilities are all booleans', () => {
    assertCapabilities(new FbPageAdapter({
      tenant_id: 't', page_id: 'p', page_token: 't', manualPolling: true,
    }));
  });

  it('FbPageAdapter thread_history is true', () => {
    const a = new FbPageAdapter({
      tenant_id: 't', page_id: 'p', page_token: 't', manualPolling: true,
    });
    expect(a.capabilities.thread_history).toBe(true);
  });

  it('TwilioSmsAdapter reactions is false', () => {
    const a = new TwilioSmsAdapter({
      tenant_id: 't', accountSid: 'AC123', authToken: 'auth', fromNumber: '+15005550006', manualPolling: true,
    });
    expect(a.capabilities.reactions).toBe(false);
  });

  it('LoomA2aAdapter webhook_inbox is false', () => {
    const a = new LoomA2aAdapter({
      tenant_id: 't', agent_id: 'p', manualPolling: true,
    });
    expect(a.capabilities.webhook_inbox).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// healthCheck — returns { ok: false } when credentials are invalid
// ---------------------------------------------------------------------------

describe('healthCheck', () => {
  it('TelegramOwnerAdapter returns ok:false on 401 getMe', async () => {
    const adapter = new TelegramOwnerAdapter({
      tenant_id: 't',
      botToken: 'bad-token',
      chatIdAllowlist: [],
      manualPolling: true,
      fetchImpl: failFetch(),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('TelegramOwnerAdapter returns ok:true on successful getMe', async () => {
    const adapter = new TelegramOwnerAdapter({
      tenant_id: 't',
      botToken: 'good-token',
      chatIdAllowlist: [],
      manualPolling: true,
      fetchImpl: okFetch({ ok: true, result: { id: 123, is_bot: true, username: 'testbot' } }),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('FbPageAdapter returns ok:false on 401 /me', async () => {
    const adapter = new FbPageAdapter({
      tenant_id: 't',
      page_id: 'p1',
      page_token: 'bad',
      manualPolling: true,
      fetchImpl: failFetch(),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('TwilioSmsAdapter returns ok:false on 401 /Accounts', async () => {
    const adapter = new TwilioSmsAdapter({
      tenant_id: 't',
      accountSid: 'AC_bad',
      authToken: 'bad',
      fromNumber: '+15005550006',
      manualPolling: true,
      fetchImpl: failFetch(),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('InstagramAdapter returns ok:false on 401 healthCheck', async () => {
    const adapter = new InstagramAdapter({
      tenant_id: 't',
      ig_user_id: 'u1',
      page_token: 'bad-token',
      manualPolling: true,
      fetchImpl: failFetch(),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('WhatsappBusinessAdapter returns ok:false on 401', async () => {
    const adapter = new WhatsappBusinessAdapter({
      tenant_id: 't',
      phone_number_id: 'pn1',
      business_account_id: 'ba1',
      permanent_access_token: 'bad',
      manualPolling: true,
      fetchImpl: failFetch(),
    });
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AdapterRegistry.getByChannelId
// ---------------------------------------------------------------------------

describe('AdapterRegistry.getByChannelId', () => {
  const registry = new AdapterRegistry('tenant-1', {
    telegram: {
      enabled: true,
      bot_token: 'tok',
      chat_id_allowlist: [123],
    },
    'fb-page': {
      enabled: true,
      page_id: 'p1',
      page_token: 'pt',
    },
  });

  it('returns TelegramOwnerAdapter for "telegram"', () => {
    const adapter = registry.getByChannelId('telegram');
    expect(adapter).toBeDefined();
    expect(adapter?.channel_id).toBe('telegram');
    expect(adapter?.name).toBe('telegram');
  });

  it('returns FbPageAdapter for "fb-page"', () => {
    const adapter = registry.getByChannelId('fb-page');
    expect(adapter).toBeDefined();
    expect(adapter?.channel_id).toBe('fb-page');
  });

  it('returns undefined for unknown channel_id', () => {
    const adapter = registry.getByChannelId('nonexistent');
    expect(adapter).toBeUndefined();
  });

  it('returns undefined for disabled channel', () => {
    const reg2 = new AdapterRegistry('tenant-2', {
      telegram: {
        enabled: false,
        bot_token: 'tok',
        chat_id_allowlist: [],
      },
    });
    expect(reg2.getByChannelId('telegram')).toBeUndefined();
  });
});
