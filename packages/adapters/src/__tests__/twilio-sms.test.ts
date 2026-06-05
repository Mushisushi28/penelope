/**
 * Twilio SMS adapter unit tests.
 * Focus: E.164 phone number validation, constructor config, send().
 */

import { describe, it, expect } from 'vitest';
import { isValidE164, assertE164, TwilioSmsAdapter } from '../twilio-sms.js';
import { AdapterConfigError } from '../types.js';

// ---------------------------------------------------------------------------
// isValidE164
// ---------------------------------------------------------------------------

describe('isValidE164', () => {
  it('accepts valid US number', () => {
    expect(isValidE164('+15005550006')).toBe(true);
  });

  it('accepts valid UK number', () => {
    expect(isValidE164('+441234567890')).toBe(true);
  });

  it('accepts valid Canadian number', () => {
    expect(isValidE164('+14035550100')).toBe(true);
  });

  it('rejects number without + prefix', () => {
    expect(isValidE164('15005550006')).toBe(false);
  });

  it('rejects number with spaces', () => {
    expect(isValidE164('+1 500 555 0006')).toBe(false);
  });

  it('rejects number with dashes', () => {
    expect(isValidE164('+1-500-555-0006')).toBe(false);
  });

  it('rejects number starting with +0', () => {
    expect(isValidE164('+0123456789')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidE164('')).toBe(false);
  });

  it('rejects too long number (> 15 digits)', () => {
    expect(isValidE164('+1234567890123456')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertE164
// ---------------------------------------------------------------------------

describe('assertE164', () => {
  it('does not throw on valid number', () => {
    expect(() => assertE164('fromNumber', '+15005550006')).not.toThrow();
  });

  it('throws AdapterConfigError on invalid number', () => {
    expect(() => assertE164('fromNumber', '555-1234')).toThrow(AdapterConfigError);
  });

  it('error message includes the field name and value', () => {
    try {
      assertE164('fromNumber', 'bad-number');
    } catch (e) {
      expect((e as Error).message).toContain('fromNumber');
      expect((e as Error).message).toContain('bad-number');
    }
  });
});

// ---------------------------------------------------------------------------
// TwilioSmsAdapter constructor
// ---------------------------------------------------------------------------

describe('TwilioSmsAdapter constructor', () => {
  const validOpts = {
    tenant_id: 'acme',
    accountSid: 'ACxxxxxx',
    authToken: 'secret',
    fromNumber: '+15005550006',
    manualPolling: true,
  };

  it('constructs successfully with valid options', () => {
    const adapter = new TwilioSmsAdapter(validOpts);
    expect(adapter.name).toBe('twilio-sms');
  });

  it('throws AdapterConfigError when accountSid is missing', () => {
    expect(() => new TwilioSmsAdapter({ ...validOpts, accountSid: '' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when fromNumber is invalid', () => {
    expect(() => new TwilioSmsAdapter({ ...validOpts, fromNumber: '555-1234' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when tenant_id is empty', () => {
    expect(() => new TwilioSmsAdapter({ ...validOpts, tenant_id: '' }))
      .toThrow(AdapterConfigError);
  });
});

// ---------------------------------------------------------------------------
// TwilioSmsAdapter.send()
// ---------------------------------------------------------------------------

describe('TwilioSmsAdapter.send()', () => {
  it('throws on invalid to-number', async () => {
    const adapter = new TwilioSmsAdapter({
      tenant_id: 'acme',
      accountSid: 'ACxxxx',
      authToken: 'secret',
      fromNumber: '+15005550006',
      manualPolling: true,
    });
    await adapter.start(async () => {});
    await expect(adapter.send({
      tenant_id: 'acme',
      channel: 'twilio-sms',
      external_thread_id: 'not-a-phone',
      text: 'hello',
    })).rejects.toThrow(AdapterConfigError);
    await adapter.stop();
  });

  it('returns external_id on success', async () => {
    const fakeFetch = async (_url: string, _init?: unknown) => ({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SMxxx', status: 'queued' }),
      text: async () => '',
      statusText: 'Created',
    });
    const adapter = new TwilioSmsAdapter({
      tenant_id: 'acme',
      accountSid: 'ACxxxx',
      authToken: 'secret',
      fromNumber: '+15005550006',
      manualPolling: true,
      fetchImpl: fakeFetch as typeof globalThis.fetch,
    });
    await adapter.start(async () => {});
    const result = await adapter.send({
      tenant_id: 'acme',
      channel: 'twilio-sms',
      external_thread_id: '+14035551234',
      text: 'hello',
    });
    expect(result.external_id).toBe('SMxxx');
    await adapter.stop();
  });
});
