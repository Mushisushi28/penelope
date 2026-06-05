/**
 * @penelope/billing — type definitions
 */

export type PlanId = "free" | "starter" | "pro";

export type PlanStatus = "active" | "trialing" | "past_due" | "canceled" | "suspended";

export interface PlanQuotas {
  channels: number;
  messages_per_month: number;
  tenants: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD cents (0 = free) */
  priceUsdCents: number;
  /** Stripe Price ID — undefined on the free plan */
  stripePriceId?: string;
  quotas: PlanQuotas;
}

export interface Subscription {
  tenantId: string;
  planId: PlanId;
  status: PlanStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** ISO 8601 */
  currentPeriodStart: string;
  /** ISO 8601 */
  currentPeriodEnd: string;
  /** ISO 8601 — set when status transitions to suspended */
  suspendedAt?: string;
}

export interface MeteredUsage {
  tenantId: string;
  /** ISO 8601 date string (YYYY-MM-DD) */
  date: string;
  messages_handled: number;
  channels_active: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  stripeInvoiceId: string;
  amountDueUsdCents: number;
  amountPaidUsdCents: number;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 or null if not yet paid */
  paidAt: string | null;
  hostedInvoiceUrl?: string;
}

/** Tenant billing config as stored in tenant.json */
export interface TenantBillingConfig {
  enabled: boolean;
  planId?: PlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/** Billing is enabled only when env var + tenant config both opt in */
export function isBillingEnabled(config: TenantBillingConfig | undefined): boolean {
  return Boolean(process.env["STRIPE_SECRET_KEY"] && config?.enabled);
}
