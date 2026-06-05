/**
 * @penelope/hermes/stripe — Stripe convenience helpers
 *
 * Wraps Hermes invoke() for the most common Stripe operations.
 * Per-tenant secrets come from tenants/<id>/.secrets/stripe.json — never committed.
 */

import { readFileSync } from 'node:fs';
import { invoke, findOp } from '../invoke.js';
import type { Connector, InvokeResult, TenantCredentials } from '../types.js';

export interface LineItem {
  price: string;
  quantity: number;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
  status: string;
  payment_status: string;
  [key: string]: unknown;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  [key: string]: unknown;
}

export interface Refund {
  id: string;
  amount: number;
  status: string;
  payment_intent: string;
  [key: string]: unknown;
}

export interface CheckoutParams {
  items: LineItem[];
  successUrl: string;
  cancelUrl: string;
  mode?: string;
  customerId?: string;
}

export async function createCheckoutSession(
  connector: Connector,
  creds: TenantCredentials,
  params: CheckoutParams
): Promise<InvokeResult<CheckoutSessionResult>> {
  const op = findOp(connector, 'PostCheckoutSessions');
  const args: Record<string, unknown> = {
    'line_items': params.items,
    'mode': params.mode ?? 'payment',
    'success_url': params.successUrl,
    'cancel_url': params.cancelUrl,
  };
  if (params.customerId) args['customer'] = params.customerId;
  return invoke<CheckoutSessionResult>(connector, op, args, creds);
}

export async function listPayments(
  connector: Connector,
  creds: TenantCredentials,
  since?: number,
  limit = 20
): Promise<InvokeResult<{ data: PaymentIntent[]; has_more: boolean }>> {
  const op = findOp(connector, 'GetPaymentIntents');
  const args: Record<string, unknown> = { limit: String(limit) };
  if (since !== undefined) args['created[gte]'] = String(since);
  return invoke(connector, op, args, creds);
}

export async function refund(
  connector: Connector,
  creds: TenantCredentials,
  paymentId: string,
  amount?: number
): Promise<InvokeResult<Refund>> {
  const op = findOp(connector, 'PostRefunds');
  const args: Record<string, unknown> = { payment_intent: paymentId };
  if (amount !== undefined) args['amount'] = String(amount);
  return invoke<Refund>(connector, op, args, creds);
}

/**
 * Load Stripe credentials from a secrets file.
 * Schema: { "STRIPE_API_KEY": "sk_live_..." }
 * Never commit secrets files.
 */
export function loadStripeCredentials(secretsFilePath: string): TenantCredentials {
  const raw = readFileSync(secretsFilePath, 'utf-8');
  return JSON.parse(raw) as TenantCredentials;
}
