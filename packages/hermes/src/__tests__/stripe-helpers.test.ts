/**
 * @penelope/hermes/stripe — Stripe helpers tests (MSW mock server)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createCheckoutSession, listPayments, refund } from '../specialists/stripe-helpers.js';
import type { Connector, TenantCredentials } from '../types.js';

// Minimal Stripe connector stub
const STRIPE_CONNECTOR: Connector = {
  id: 'stripe',
  name: 'Stripe',
  version: '2024-06-20',
  discoveredAt: '2024-01-01T00:00:00.000Z',
  discoveryStrategy: 'openapi',
  baseUrl: 'https://api.stripe.com',
  authStrategy: {
    type: 'api-key',
    placement: 'header',
    headerName: 'Authorization',
    prefix: 'Bearer ',
    envVar: 'STRIPE_API_KEY',
  },
  operations: [
    {
      operationId: 'PostCheckoutSessions',
      method: 'POST',
      path: '/v1/checkout/sessions',
      summary: 'Create checkout session',
    },
    {
      operationId: 'GetPaymentIntents',
      method: 'GET',
      path: '/v1/payment_intents',
      summary: 'List payment intents',
      parameters: [
        { name: 'limit', in: 'query', required: false },
        { name: 'created[gte]', in: 'query', required: false },
      ],
    },
    {
      operationId: 'PostRefunds',
      method: 'POST',
      path: '/v1/refunds',
      summary: 'Create refund',
    },
  ],
};

const CREDS: TenantCredentials = { STRIPE_API_KEY: 'sk_test_abc123' };

// MSW server
const server = setupServer(
  http.post('https://api.stripe.com/v1/checkout/sessions', () =>
    HttpResponse.json({
      id: 'cs_test_abc',
      url: 'https://checkout.stripe.com/pay/cs_test_abc',
      status: 'open',
      payment_status: 'unpaid',
    })
  ),
  http.get('https://api.stripe.com/v1/payment_intents', () =>
    HttpResponse.json({
      data: [
        { id: 'pi_test_1', amount: 5000, currency: 'usd', status: 'succeeded', created: 1700000000 },
        { id: 'pi_test_2', amount: 2500, currency: 'usd', status: 'requires_capture', created: 1700001000 },
      ],
      has_more: false,
    })
  ),
  http.post('https://api.stripe.com/v1/refunds', () =>
    HttpResponse.json({
      id: 're_test_abc',
      amount: 5000,
      status: 'succeeded',
      payment_intent: 'pi_test_1',
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('createCheckoutSession', () => {
  it('returns ok with session id and url', async () => {
    const result = await createCheckoutSession(STRIPE_CONNECTOR, CREDS, {
      items: [{ price: 'price_abc', quantity: 1 }],
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });
    expect(result.ok).toBe(true);
    expect(result.data.id).toBe('cs_test_abc');
    expect(result.data.url).toMatch(/checkout\.stripe\.com/);
  });

  it('sends Authorization header with Bearer prefix', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.post('https://api.stripe.com/v1/checkout/sessions', ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({
          id: 'cs_auth_test',
          url: 'https://checkout.stripe.com/pay/cs_auth_test',
          status: 'open',
          payment_status: 'unpaid',
        });
      })
    );
    await createCheckoutSession(STRIPE_CONNECTOR, CREDS, {
      items: [{ price: 'price_abc', quantity: 1 }],
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });
    expect(capturedAuth).toBe('Bearer sk_test_abc123');
  });
});

describe('listPayments', () => {
  it('returns payment intents list', async () => {
    const result = await listPayments(STRIPE_CONNECTOR, CREDS);
    expect(result.ok).toBe(true);
    expect(result.data.data).toHaveLength(2);
    expect(result.data.has_more).toBe(false);
  });

  it('passes limit query param', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('https://api.stripe.com/v1/payment_intents', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], has_more: false });
      })
    );
    await listPayments(STRIPE_CONNECTOR, CREDS, undefined, 5);
    expect(capturedUrl).toContain('limit=5');
  });

  it('passes created[gte] when since provided', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('https://api.stripe.com/v1/payment_intents', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], has_more: false });
      })
    );
    await listPayments(STRIPE_CONNECTOR, CREDS, 1700000000);
    expect(capturedUrl).toContain('created');
    expect(capturedUrl).toContain('1700000000');
  });
});

describe('refund', () => {
  it('returns refund object', async () => {
    const result = await refund(STRIPE_CONNECTOR, CREDS, 'pi_test_1');
    expect(result.ok).toBe(true);
    expect(result.data.id).toBe('re_test_abc');
    expect(result.data.status).toBe('succeeded');
  });

  it('passes partial amount when specified', async () => {
    let capturedBody: string | null = null;
    server.use(
      http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.json({
          id: 're_partial',
          amount: 1000,
          status: 'succeeded',
          payment_intent: 'pi_test_1',
        });
      })
    );
    const result = await refund(STRIPE_CONNECTOR, CREDS, 'pi_test_1', 1000);
    expect(result.data.amount).toBe(1000);
    expect(capturedBody).toBeTruthy();
  });
});
