/**
 * @penelope/billing — thin Stripe client wrapper
 *
 * Lazy-loads `stripe` only when STRIPE_SECRET_KEY is present. Self-hosted
 * installations that never set the env var pay zero import cost.
 */

import type Stripe from "stripe";
import type { Invoice, MeteredUsage } from "./types.js";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    throw new Error(
      "@penelope/billing: STRIPE_SECRET_KEY is not set. Billing is opt-in — set this env var to enable."
    );
  }
  // Dynamic import keeps the stripe package optional at runtime for self-hosted users.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeConstructor = require("stripe") as typeof Stripe;
  _stripe = new StripeConstructor(key, { apiVersion: "2024-06-20" });
  return _stripe;
}

export interface CreateCustomerParams {
  tenantId: string;
  email: string;
  name?: string;
}

export async function createCustomer(
  params: CreateCustomerParams
): Promise<{ customerId: string }> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: params.email,
    ...(params.name !== undefined ? { name: params.name } : {}),
    metadata: { tenantId: params.tenantId },
  });
  return { customerId: customer.id };
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  tenantId: string;
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<{ subscriptionId: string; status: string }> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    metadata: { tenantId: params.tenantId },
  });
  return { subscriptionId: subscription.id, status: subscription.status };
}

export interface RecordMeteredUsageParams {
  subscriptionItemId: string;
  quantity: number;
  /** Unix timestamp — defaults to now */
  timestamp?: number;
}

export async function recordMeteredUsage(
  params: RecordMeteredUsageParams
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptionItems.createUsageRecord(params.subscriptionItemId, {
    quantity: params.quantity,
    timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
    action: "increment",
  });
}

export async function listInvoices(customerId: string): Promise<Invoice[]> {
  const stripe = getStripe();
  const list = await stripe.invoices.list({
    customer: customerId,
    limit: 100,
  });
  return list.data.map((inv) => {
    const tenantId = inv.metadata?.["tenantId"] ?? "";
    const hostedUrl = inv.hosted_invoice_url ?? undefined;
    const entry: Invoice = {
      id: inv.id ?? "",
      tenantId,
      stripeInvoiceId: inv.id ?? "",
      amountDueUsdCents: inv.amount_due,
      amountPaidUsdCents: inv.amount_paid,
      status: (inv.status ?? "draft") as Invoice["status"],
      createdAt: new Date(inv.created * 1000).toISOString(),
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
        : null,
      ...(hostedUrl !== undefined ? { hostedInvoiceUrl: hostedUrl } : {}),
    };
    return entry;
  });
}

export async function voidSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId, { prorate: true });
}

/** Exposed for testing — resets the cached stripe instance */
export function _resetStripeInstance(): void {
  _stripe = null;
}

export type { MeteredUsage };
