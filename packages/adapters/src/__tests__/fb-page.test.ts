/**
 * FB Page adapter unit tests.
 * Focus: 24h window check + message normalisation.
 */

import { describe, it, expect } from 'vitest';
import {
  lastCustomerMessageMs,
  withinMessengerWindow,
  FbPageAdapter,
} from '../fb-page.js';
import { WindowExpiredError, AdapterConfigError } from '../types.js';
import type { InboundMessage } from '../types.js';

// ---------------------------------------------------------------------------
// withinMessengerWindow
// ---------------------------------------------------------------------------

describe('withinMessengerWindow', () => {
  it('returns true when message is 1 hour old', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    expect(withinMessengerWindow(oneHourAgo)).toBe(true);
  });

  it('returns true at exactly 23h 59m', () => {
    const almost24h = Date.now() - (24 * 60 * 60 * 1000 - 60 * 1000);
    expect(withinMessengerWindow(almost24h)).toBe(true);
  });

  it('returns false when message is 25 hours old', () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    expect(withinMessengerWindow(twentyFiveHoursAgo)).toBe(false);
  });

  it('returns false when message is exactly 24 hours old', () => {
    const exactly24h = Date.now() - 24 * 60 * 60 * 1000;
    expect(withinMessengerWindow(exactly24h)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lastCustomerMessageMs
// ---------------------------------------------------------------------------

describe('lastCustomerMessageMs', () => {
  const PAGE_ID = '12345';

  it('returns null when all messages are from the page', () => {
    const messages = [
      { id: 'm1', message: 'hello', from: { id: PAGE_ID, name: 'DHR Page' }, created_time: new Date().toISOString() },
    ];
    expect(lastCustomerMessageMs(messages as never, PAGE_ID)).toBe(null);
  });

  it('returns the timestamp of the first customer message (newest-first)', () => {
    const customerTime = new Date('2024-01-01T10:00:00Z');
    const messages = [
      { id: 'm2', message: 'page reply', from: { id: PAGE_ID }, created_time: new Date().toISOString() },
      { id: 'm1', message: 'hi', from: { id: 'customer-psid' }, created_time: customerTime.toISOString() },
    ];
    const result = lastCustomerMessageMs(messages as never, PAGE_ID);
    expect(result).toBe(customerTime.getTime());
  });

  it('returns null on empty message list', () => {
    expect(lastCustomerMessageMs([], PAGE_ID)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// FbPageAdapter config validation
// ---------------------------------------------------------------------------

describe('FbPageAdapter constructor', () => {
  it('throws AdapterConfigError when page_token is missing', () => {
    expect(() => new FbPageAdapter({
      tenant_id: 't1',
      page_id: '999',
      page_token: '',
    })).toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when tenant_id is missing', () => {
    expect(() => new FbPageAdapter({
      tenant_id: '',
      page_id: '999',
      page_token: 'tok',
    })).toThrow(AdapterConfigError);
  });

  it('constructs successfully with valid options', () => {
    const adapter = new FbPageAdapter({
      tenant_id: 'dhr',
      page_id: '12345',
      page_token: 'EAAabc...',
      manualPolling: true,
    });
    expect(adapter.name).toBe('fb-page');
  });
});

// ---------------------------------------------------------------------------
// FbPageAdapter send() — window enforcement
// ---------------------------------------------------------------------------

describe('FbPageAdapter.send() window enforcement', () => {
  const makeAdapter = (windowMode: 'enforce' | 'warn' | 'off') => {
    const received: InboundMessage[] = [];
    const fakeFetch = async (_url: string, _init?: unknown) => ({
      ok: true,
      json: async () => ({ message_id: 'mid_123', recipient_id: 'psid_456' }),
      text: async () => '',
      status: 200,
      statusText: 'OK',
    });

    const adapter = new FbPageAdapter({
      tenant_id: 'test',
      page_id: 'me',
      page_token: 'tok',
      window_mode: windowMode,
      manualPolling: true,
      fetchImpl: fakeFetch as typeof globalThis.fetch,
    });
    return { adapter, received };
  };

  it('throws WindowExpiredError in enforce mode when window has expired', async () => {
    const { adapter } = makeAdapter('enforce');
    await adapter.start(async () => {});

    // Inject a stale last-customer-message time by triggering a pollOnce
    // with a conversation where the last message is 25h old.
    // Since we can't directly set the map, we test via the window helper.
    // The enforce-mode path is guarded by lastCustomerMs map; skip pollOnce
    // and test the send guard indirectly via the window_mode='off' path.

    // For enforce mode with no known thread: no lastCustomerMs entry
    // → no enforcement (first message scenario). That's correct behaviour.
    // This test verifies the error is thrown when we have an expired entry:
    const expiredMs = Date.now() - 25 * 60 * 60 * 1000;
    // Access private map via the test seam (cast to any).
    (adapter as unknown as { lastCustomerMs: Map<string, number> })
      .lastCustomerMs.set('customer-psid', expiredMs);

    await expect(adapter.send({
      tenant_id: 'test',
      channel: 'fb-page',
      external_thread_id: 'customer-psid',
      text: 'hello',
    })).rejects.toThrow(WindowExpiredError);

    await adapter.stop();
  });

  it('does NOT throw WindowExpiredError in off mode', async () => {
    const { adapter } = makeAdapter('off');
    await adapter.start(async () => {});
    const expiredMs = Date.now() - 25 * 60 * 60 * 1000;
    (adapter as unknown as { lastCustomerMs: Map<string, number> })
      .lastCustomerMs.set('customer-psid', expiredMs);

    // Should not throw — just tries the network call.
    // Since fake fetch returns a valid response, it resolves.
    const result = await adapter.send({
      tenant_id: 'test',
      channel: 'fb-page',
      external_thread_id: 'customer-psid',
      text: 'hello',
    });
    expect(result.external_id).toBe('mid_123');
    await adapter.stop();
  });
});
