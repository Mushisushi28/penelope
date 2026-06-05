/**
 * @penelope/billing — quota enforcement middleware
 *
 * Subscribes to the Penelope bus on the `message.handled` event and
 * checks per-tenant plan limits. Returns a 429-style error object when
 * the tenant is over quota.
 *
 * This is a standalone subscriber — it does not depend on Express or any
 * HTTP stack. Callers that need HTTP integration wrap the returned error
 * in their own response format.
 */

import { getPlan, isOverQuota } from "./plans.js";
import type { Subscription, TenantBillingConfig, PlanId } from "./types.js";
import { isBillingEnabled } from "./types.js";

export interface QuotaCheckInput {
  tenantId: string;
  billingConfig: TenantBillingConfig | undefined;
  subscription: Subscription | undefined;
  /** Current period message count (caller must provide) */
  messagesThisPeriod: number;
  /** Number of active channels (caller must provide) */
  channelsActive: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  /** Present when allowed=false */
  error?: {
    code: 429 | 403;
    reason: "over_message_quota" | "over_channel_quota" | "suspended" | "billing_required";
    message: string;
    planId: PlanId;
  };
}

/**
 * Pure quota check — no side effects.
 * Returns { allowed: true } for self-hosted tenants (billing disabled).
 */
export function checkQuota(input: QuotaCheckInput): QuotaCheckResult {
  const { tenantId, billingConfig, subscription, messagesThisPeriod, channelsActive } = input;

  // Billing is opt-in. Self-hosted = always allowed.
  if (!isBillingEnabled(billingConfig)) {
    return { allowed: true };
  }

  // If billing is enabled but no subscription exists, reject with 403.
  if (!subscription) {
    return {
      allowed: false,
      error: {
        code: 403,
        reason: "billing_required",
        message: `Tenant ${tenantId} has billing enabled but no active subscription.`,
        planId: "free",
      },
    };
  }

  // Suspended tenants are fully blocked.
  if (subscription.status === "suspended" || subscription.status === "canceled") {
    return {
      allowed: false,
      error: {
        code: 403,
        reason: "suspended",
        message: `Tenant ${tenantId} subscription is ${subscription.status}.`,
        planId: subscription.planId,
      },
    };
  }

  const plan = getPlan(subscription.planId);

  if (isOverQuota(plan, "messages_per_month", messagesThisPeriod)) {
    return {
      allowed: false,
      error: {
        code: 429,
        reason: "over_message_quota",
        message: `Tenant ${tenantId} has exceeded the ${plan.quotas.messages_per_month} message/month limit on the ${plan.name} plan.`,
        planId: plan.id,
      },
    };
  }

  if (isOverQuota(plan, "channels", channelsActive)) {
    return {
      allowed: false,
      error: {
        code: 429,
        reason: "over_channel_quota",
        message: `Tenant ${tenantId} has exceeded the ${plan.quotas.channels} channel limit on the ${plan.name} plan.`,
        planId: plan.id,
      },
    };
  }

  return { allowed: true };
}

/**
 * Bus event shape emitted by the Penelope core on each handled message.
 * Billing middleware subscribes to this and increments counters.
 */
export interface MessageHandledEvent {
  tenantId: string;
  channelId: string;
  messageId: string;
  handledAt: string;
}

/**
 * In-memory per-tenant counter store.
 * Production deployments should back this with Redis or a DB.
 */
export class InMemoryUsageStore {
  private readonly counts = new Map<string, { messages: number; channels: Set<string> }>();

  increment(tenantId: string, channelId: string): void {
    if (!this.counts.has(tenantId)) {
      this.counts.set(tenantId, { messages: 0, channels: new Set() });
    }
    const entry = this.counts.get(tenantId)!;
    entry.messages += 1;
    entry.channels.add(channelId);
  }

  getMessages(tenantId: string): number {
    return this.counts.get(tenantId)?.messages ?? 0;
  }

  getChannels(tenantId: string): number {
    return this.counts.get(tenantId)?.channels.size ?? 0;
  }

  reset(tenantId: string): void {
    this.counts.delete(tenantId);
  }

  resetAll(): void {
    this.counts.clear();
  }
}
