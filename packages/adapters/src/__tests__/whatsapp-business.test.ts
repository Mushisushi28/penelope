/**
 * WhatsApp Business adapter unit tests.
 *
 * Tests: constructor validation, webhook HMAC, outbound payload, 24h window,
 * template send, inbound parsing, status updates, rate-limit handling.
 */

import { createHmac } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  WhatsappBusinessAdapter,
  withinWhatsappWindow,
  verifyWebhookSignature,
} from '../whatsapp-business.js';
import { AdapterConfigError, WindowExpiredError } from '../types.js';
import type { InboundMessage } from '../types.js';
import type { WaTemplate } from '../whatsapp-business.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_OPTS = {
  tenant_id: 'acme',
  phone_number_id: '123456789',
  business_account_id: '987654321',
  permanent_access_token: 'EAAabc123xyz',
  manualPolling: true,
};

const SILENT_LOGGER = { info: () => {}, error: () => {} };

function makeFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: { get: (h: string) => (h === 'Retry-After' ? '60' : null) },
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  const fetchImpl = makeFetch({ messages: [{ id: 'wamid.msg123' }] });
  const adapter = new WhatsappBusinessAdapter({
    ...VALID_OPTS,
    logger: SILENT_LOGGER,
    fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    ...overrides,
  });
  return { adapter, fetchImpl };
}

// ---------------------------------------------------------------------------
// 1. Constructor validates required fields
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter constructor', () => {
  it('throws AdapterConfigError when tenant_id is missing', () => {
    expect(() => new WhatsappBusinessAdapter({
      ...VALID_OPTS,
      tenant_id: '',
    })).toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when phone_number_id is missing', () => {
    expect(() => new WhatsappBusinessAdapter({
      ...VALID_OPTS,
      phone_number_id: '',
    })).toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when business_account_id is missing', () => {
    expect(() => new WhatsappBusinessAdapter({
      ...VALID_OPTS,
      business_account_id: '',
    })).toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when permanent_access_token is missing', () => {
    expect(() => new WhatsappBusinessAdapter({
      ...VALID_OPTS,
      permanent_access_token: '   ',
    })).toThrow(AdapterConfigError);
  });

  it('constructs successfully with all required fields', () => {
    const { adapter } = makeAdapter();
    expect(adapter.name).toBe('whatsapp-business');
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook HMAC-SHA256 verification
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature', () => {
  const SECRET = 'my-webhook-secret';
  const BODY = '{"object":"whatsapp_business_account"}';

  it('returns true for correct signature', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyWebhookSignature(BODY, `sha256=${hex}`, SECRET)).toBe(true);
  });

  it('returns false for wrong signature', () => {
    expect(verifyWebhookSignature(BODY, 'sha256=deadbeef00', SECRET)).toBe(false);
  });

  it('returns false for empty signature', () => {
    expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false);
  });

  it('handles signature without sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyWebhookSignature(BODY, hex, SECRET)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Outbound text payload format
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter.send() — text message', () => {
  it('POSTs correct JSON structure for a text message', async () => {
    const { adapter, fetchImpl } = makeAdapter();
    await adapter.start(async () => {});

    await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: 'Hello from Penelope!',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/123456789/messages');
    const body = JSON.parse(init.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.type).toBe('text');
    expect(body.to).toBe('+14035551234');
    expect(body.text.body).toBe('Hello from Penelope!');

    await adapter.stop();
  });

  it('includes Authorization Bearer header', async () => {
    const { adapter, fetchImpl } = makeAdapter();
    await adapter.start(async () => {});

    await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: 'Hi',
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer EAAabc123xyz');

    await adapter.stop();
  });
});

// ---------------------------------------------------------------------------
// 4. 24-hour window enforcement
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter.send() — 24h window enforcement', () => {
  it('throws WindowExpiredError in enforce mode when window has expired', async () => {
    const { adapter } = makeAdapter({ window_mode: 'enforce' });
    await adapter.start(async () => {});

    // Inject expired last-customer timestamp
    const expiredMs = Date.now() - 25 * 60 * 60 * 1000;
    (adapter as unknown as { lastCustomerMs: Map<string, number> })
      .lastCustomerMs.set('+14035551234', expiredMs);

    await expect(adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: 'Hello',
    })).rejects.toThrow(WindowExpiredError);

    await adapter.stop();
  });

  it('does NOT throw WindowExpiredError when window_mode is off', async () => {
    const { adapter } = makeAdapter({ window_mode: 'off' });
    await adapter.start(async () => {});

    const expiredMs = Date.now() - 25 * 60 * 60 * 1000;
    (adapter as unknown as { lastCustomerMs: Map<string, number> })
      .lastCustomerMs.set('+14035551234', expiredMs);

    const result = await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: 'Hello',
    });
    expect(result.external_id).toBe('wamid.msg123');

    await adapter.stop();
  });

  it('allows template send even when 24h window is expired (enforce mode)', async () => {
    const { adapter } = makeAdapter({ window_mode: 'enforce' });
    await adapter.start(async () => {});

    const expiredMs = Date.now() - 25 * 60 * 60 * 1000;
    (adapter as unknown as { lastCustomerMs: Map<string, number> })
      .lastCustomerMs.set('+14035551234', expiredMs);

    const template: WaTemplate = { name: 'hello_world', language: 'en_US' };
    const result = await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: '',
      meta: { template },
    });
    expect(result.external_id).toBe('wamid.msg123');

    await adapter.stop();
  });

  it('withinWhatsappWindow returns true for 1h ago', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    expect(withinWhatsappWindow(oneHourAgo)).toBe(true);
  });

  it('withinWhatsappWindow returns false for 25h ago', () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    expect(withinWhatsappWindow(twentyFiveHoursAgo)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Template message format
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter.send() — template message', () => {
  it('formats template payload correctly with components', async () => {
    const { adapter, fetchImpl } = makeAdapter();
    await adapter.start(async () => {});

    const template: WaTemplate = {
      name: 'appointment_reminder',
      language: 'en_US',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'John' },
            { type: 'text', text: '2026-06-05 at 10:00am' },
          ],
        },
      ],
    };

    await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: '',
      meta: { template },
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('appointment_reminder');
    expect(body.template.language.code).toBe('en_US');
    expect(body.template.components[0].type).toBe('body');
    expect(body.template.components[0].parameters[0].text).toBe('John');

    await adapter.stop();
  });

  it('defaults language to en_US when not specified', async () => {
    const { adapter, fetchImpl } = makeAdapter();
    await adapter.start(async () => {});

    const template: WaTemplate = { name: 'hello_world' };
    await adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: '',
      meta: { template },
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.template.language.code).toBe('en_US');

    await adapter.stop();
  });
});

// ---------------------------------------------------------------------------
// 6. Inbound webhook parsing
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter.processWebhookPayload()', () => {
  it('parses and delivers a text message from webhook payload', async () => {
    const received: InboundMessage[] = [];
    const { adapter } = makeAdapter();
    await adapter.start(async (msg) => { received.push(msg); });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '987654321',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '14025551234', phone_number_id: '123456789' },
            contacts: [{ profile: { name: 'Jane Doe' }, wa_id: '+14035559876' }],
            messages: [{
              id: 'wamid.inbound001',
              from: '+14035559876',
              timestamp: '1717500000',
              type: 'text',
              text: { body: 'Can I get a quote?' },
            }],
          },
        }],
      }],
    };

    const delivered = await adapter.processWebhookPayload(payload);
    expect(delivered).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.text).toBe('Can I get a quote?');
    expect(received[0]!.external_user_id).toBe('+14035559876');
    expect(received[0]!.user_display_name).toBe('Jane Doe');
    expect(received[0]!.channel).toBe('whatsapp-business');

    await adapter.stop();
  });

  it('deduplicates messages with the same id', async () => {
    const received: InboundMessage[] = [];
    const { adapter } = makeAdapter();
    await adapter.start(async (msg) => { received.push(msg); });

    const msg = {
      id: 'wamid.dup001',
      from: '+14035559876',
      timestamp: '1717500000',
      type: 'text',
      text: { body: 'Duplicate' },
    };
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: [msg] } }],
      }],
    };

    await adapter.processWebhookPayload(payload);
    await adapter.processWebhookPayload(payload);
    expect(received).toHaveLength(1);

    await adapter.stop();
  });

  it('ignores non-message fields', async () => {
    const received: InboundMessage[] = [];
    const { adapter } = makeAdapter();
    await adapter.start(async (msg) => { received.push(msg); });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{ field: 'account_update', value: { messaging_product: 'whatsapp' } }],
      }],
    };

    const delivered = await adapter.processWebhookPayload(payload);
    expect(delivered).toBe(0);
    expect(received).toHaveLength(0);

    await adapter.stop();
  });
});

// ---------------------------------------------------------------------------
// 7. Status events (delivered / read / failed)
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter status event handling', () => {
  it('updates message status from delivered to read', async () => {
    const { adapter } = makeAdapter();
    await adapter.start(async () => {});

    const deliveredPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [{
              id: 'wamid.sent001',
              status: 'delivered',
              timestamp: '1717500100',
              recipient_id: '+14035559876',
            }],
          },
        }],
      }],
    };

    const readPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [{
              id: 'wamid.sent001',
              status: 'read',
              timestamp: '1717500200',
              recipient_id: '+14035559876',
            }],
          },
        }],
      }],
    };

    await adapter.processWebhookPayload(deliveredPayload);
    expect(adapter.getMessageStatus('wamid.sent001')?.status).toBe('delivered');

    await adapter.processWebhookPayload(readPayload);
    expect(adapter.getMessageStatus('wamid.sent001')?.status).toBe('read');

    await adapter.stop();
  });

  it('records failed status with error details', async () => {
    const { adapter } = makeAdapter();
    await adapter.start(async () => {});

    const failedPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [{
              id: 'wamid.fail001',
              status: 'failed',
              timestamp: '1717500300',
              recipient_id: '+14035559876',
              errors: [{ code: 130472, title: 'User\'s number is part of an experiment' }],
            }],
          },
        }],
      }],
    };

    await adapter.processWebhookPayload(failedPayload);
    const status = adapter.getMessageStatus('wamid.fail001');
    expect(status?.status).toBe('failed');
    expect(status?.errors?.[0]?.code).toBe(130472);

    await adapter.stop();
  });
});

// ---------------------------------------------------------------------------
// 8. Rate limit handling (429 response)
// ---------------------------------------------------------------------------

describe('WhatsappBusinessAdapter rate limit handling', () => {
  it('throws a rate limit error on 429 response', async () => {
    const rateLimitFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '120' : null) },
      json: async () => ({}),
      text: async () => '',
    });

    const adapter = new WhatsappBusinessAdapter({
      ...VALID_OPTS,
      logger: SILENT_LOGGER,
      fetchImpl: rateLimitFetch as unknown as typeof globalThis.fetch,
    });
    await adapter.start(async () => {});

    await expect(adapter.send({
      tenant_id: 'acme',
      channel: 'whatsapp-business',
      external_thread_id: '+14035551234',
      text: 'Hello',
    })).rejects.toThrow(/rate limit.*429/i);

    await adapter.stop();
  });
});
