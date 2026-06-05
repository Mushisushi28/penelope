/**
 * @penelope/billing — default plan definitions
 *
 * Three tiers: free (self-hosted), starter ($99/mo), pro ($199/mo).
 * Stripe Price IDs are read from env at runtime so they can be configured
 * per-environment without a code change.
 */

import type { Plan, PlanId } from "./types.js";

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdCents: 0,
    quotas: {
      channels: 1,
      messages_per_month: 500,
      tenants: 1,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceUsdCents: 9900,
    // stripePriceId resolved at runtime via getPlan() helper to avoid exactOptionalPropertyTypes conflict
    quotas: {
      channels: 5,
      messages_per_month: 10_000,
      tenants: 3,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdCents: 19900,
    // stripePriceId resolved at runtime via getPlan() helper to avoid exactOptionalPropertyTypes conflict
    quotas: {
      channels: 20,
      messages_per_month: 100_000,
      tenants: 20,
    },
  },
};

export function getPlan(id: PlanId): Plan {
  const base = PLANS[id];
  // Resolve optional Stripe Price IDs at call time to keep PLANS const clean.
  if (id === "starter") {
    const priceId = process.env["STRIPE_PRICE_STARTER"];
    return priceId ? { ...base, stripePriceId: priceId } : base;
  }
  if (id === "pro") {
    const priceId = process.env["STRIPE_PRICE_PRO"];
    return priceId ? { ...base, stripePriceId: priceId } : base;
  }
  return base;
}

/**
 * Returns true when the given usage value exceeds the plan's quota for that
 * dimension. Passing -1 for a quota means unlimited.
 */
export function isOverQuota(
  plan: Plan,
  dimension: keyof Plan["quotas"],
  current: number
): boolean {
  const limit = plan.quotas[dimension];
  if (limit === -1) return false;
  return current >= limit;
}
