import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PLANS, getPlan, isOverQuota } from "../plans.js";
import { checkQuota, InMemoryUsageStore } from "../quota-middleware.js";
import { buildUsageSnapshot, collectAndReport } from "../usage-collector.js";
import { processWebhookEvent } from "../webhook-handler.js";
import type { Subscription } from "../types.js";
import type Stripe from "stripe";

// ─── Plan quota checks ────────────────────────────────────────────────────────

describe("plan definitions", () => {
  it("defines free, starter, and pro plans", () => {
    expect(PLANS.free.priceUsdCents).toBe(0);
    expect(PLANS.starter.priceUsdCents).toBe(9900);
    expect(PLANS.pro.priceUsdCents).toBe(19900);
  });

  it("free plan has lower limits than starter", () => {
    expect(PLANS.free.quotas.messages_per_month).toBeLessThan(
      PLANS.starter.quotas.messages_per_month
    );
    expect(PLANS.free.quotas.channels).toBeLessThan(PLANS.starter.quotas.channels);
  });

  it("isOverQuota returns true when at or above limit", () => {
    const plan = getPlan("free");
    expect(isOverQuota(plan, "messages_per_month", plan.quotas.messages_per_month)).toBe(true);
    expect(isOverQuota(plan, "messages_per_month", plan.quotas.messages_per_month - 1)).toBe(false);
  });

  it("isOverQuota returns false for limit=-1 (unlimited)", () => {
    const plan = getPlan("pro");
    // Override quota for test
    const unlimitedPlan = { ...plan, quotas: { ...plan.quotas, messages_per_month: -1 } };
    expect(isOverQuota(unlimitedPlan, "messages_per_month", 999_999_999)).toBe(false);
  });
});

// ─── Quota middleware ─────────────────────────────────────────────────────────

describe("checkQuota()", () => {
  it("allows self-hosted tenants (billing disabled)", () => {
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: false },
      subscription: undefined,
      messagesThisPeriod: 999_999,
      channelsActive: 999,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows tenants with no STRIPE_SECRET_KEY even if config.enabled=true", () => {
    delete process.env["STRIPE_SECRET_KEY"];
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: true },
      subscription: undefined,
      messagesThisPeriod: 0,
      channelsActive: 0,
    });
    expect(result.allowed).toBe(true);
  });

  it("returns 403 when billing enabled but no subscription", () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: true },
      subscription: undefined,
      messagesThisPeriod: 0,
      channelsActive: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe(403);
    expect(result.error?.reason).toBe("billing_required");
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("returns 403 for suspended subscription", () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    const sub: Subscription = {
      tenantId: "acme",
      planId: "starter",
      status: "suspended",
      currentPeriodStart: "2026-06-01T00:00:00Z",
      currentPeriodEnd: "2026-07-01T00:00:00Z",
    };
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: true },
      subscription: sub,
      messagesThisPeriod: 0,
      channelsActive: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.error?.reason).toBe("suspended");
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("returns 429 when messages exceed plan limit", () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    const sub: Subscription = {
      tenantId: "acme",
      planId: "free",
      status: "active",
      currentPeriodStart: "2026-06-01T00:00:00Z",
      currentPeriodEnd: "2026-07-01T00:00:00Z",
    };
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: true },
      subscription: sub,
      messagesThisPeriod: PLANS.free.quotas.messages_per_month,
      channelsActive: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe(429);
    expect(result.error?.reason).toBe("over_message_quota");
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("returns 429 when channels exceed plan limit", () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    const sub: Subscription = {
      tenantId: "acme",
      planId: "free",
      status: "active",
      currentPeriodStart: "2026-06-01T00:00:00Z",
      currentPeriodEnd: "2026-07-01T00:00:00Z",
    };
    const result = checkQuota({
      tenantId: "acme",
      billingConfig: { enabled: true },
      subscription: sub,
      messagesThisPeriod: 0,
      channelsActive: PLANS.free.quotas.channels,
    });
    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe(429);
    expect(result.error?.reason).toBe("over_channel_quota");
    delete process.env["STRIPE_SECRET_KEY"];
  });
});

// ─── InMemoryUsageStore ───────────────────────────────────────────────────────

describe("InMemoryUsageStore", () => {
  it("counts messages and unique channels per tenant", () => {
    const store = new InMemoryUsageStore();
    store.increment("acme", "telegram");
    store.increment("acme", "telegram");
    store.increment("acme", "sms");
    expect(store.getMessages("acme")).toBe(3);
    expect(store.getChannels("acme")).toBe(2);
  });

  it("isolates counters between tenants", () => {
    const store = new InMemoryUsageStore();
    store.increment("acme", "telegram");
    store.increment("betacorp", "telegram");
    expect(store.getMessages("acme")).toBe(1);
    expect(store.getMessages("betacorp")).toBe(1);
  });

  it("reset clears a single tenant", () => {
    const store = new InMemoryUsageStore();
    store.increment("acme", "telegram");
    store.reset("acme");
    expect(store.getMessages("acme")).toBe(0);
  });
});

// ─── Metered usage rollup ─────────────────────────────────────────────────────

describe("collectAndReport()", () => {
  beforeEach(() => {
    delete process.env["STRIPE_SECRET_KEY"];
  });

  afterEach(() => {
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("skips all tenants when STRIPE_SECRET_KEY is unset", async () => {
    const result = await collectAndReport(
      [{ tenantId: "acme", subscriptionItemId: "si_123", messagesHandled: 100, channelsActive: 2 }],
      "2026-06-04"
    );
    expect(result.reported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips tenants with 0 messages handled", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    const result = await collectAndReport(
      [{ tenantId: "acme", subscriptionItemId: "si_123", messagesHandled: 0, channelsActive: 0 }],
      "2026-06-04"
    );
    expect(result.skipped).toBe(1);
    expect(result.reported).toBe(0);
  });

  it("records errors per tenant without throwing", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";
    // Will fail because sk_test_fake is not a real key — error captured per-tenant
    const result = await collectAndReport(
      [{ tenantId: "acme", subscriptionItemId: "si_123", messagesHandled: 50, channelsActive: 1 }],
      "2026-06-04"
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.tenantId).toBe("acme");
  });
});

describe("buildUsageSnapshot()", () => {
  it("returns a MeteredUsage with correct fields", () => {
    const snapshot = buildUsageSnapshot("acme", 123, 2, "2026-06-04");
    expect(snapshot.tenantId).toBe("acme");
    expect(snapshot.messages_handled).toBe(123);
    expect(snapshot.channels_active).toBe(2);
    expect(snapshot.date).toBe("2026-06-04");
  });
});

// ─── Webhook event parsing ────────────────────────────────────────────────────

describe("processWebhookEvent()", () => {
  it("calls onActivate for checkout.session.completed", async () => {
    const onActivate = vi.fn().mockResolvedValue(undefined);
    const onInvoicePaid = vi.fn().mockResolvedValue(undefined);
    const onSuspend = vi.fn().mockResolvedValue(undefined);

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { tenantId: "acme", planId: "starter" },
          subscription: "sub_123",
          customer: "cus_abc",
        },
      },
    } as unknown as Stripe.Event;

    const result = await processWebhookEvent(event, { onActivate, onInvoicePaid, onSuspend });
    expect(result.handled).toBe(true);
    expect(onActivate).toHaveBeenCalledWith({
      tenantId: "acme",
      stripeCustomerId: "cus_abc",
      stripeSubscriptionId: "sub_123",
      planId: "starter",
    });
  });

  it("calls onInvoicePaid for invoice.paid", async () => {
    const onActivate = vi.fn().mockResolvedValue(undefined);
    const onInvoicePaid = vi.fn().mockResolvedValue(undefined);
    const onSuspend = vi.fn().mockResolvedValue(undefined);

    const event = {
      type: "invoice.paid",
      data: {
        object: {
          id: "in_xyz",
          metadata: { tenantId: "acme" },
          subscription_details: { metadata: {} },
        },
      },
    } as unknown as Stripe.Event;

    const result = await processWebhookEvent(event, { onActivate, onInvoicePaid, onSuspend });
    expect(result.handled).toBe(true);
    expect(onInvoicePaid).toHaveBeenCalledWith({ tenantId: "acme", stripeInvoiceId: "in_xyz" });
  });

  it("calls onSuspend for customer.subscription.deleted", async () => {
    const onActivate = vi.fn().mockResolvedValue(undefined);
    const onInvoicePaid = vi.fn().mockResolvedValue(undefined);
    const onSuspend = vi.fn().mockResolvedValue(undefined);

    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_abc",
          metadata: { tenantId: "acme" },
        },
      },
    } as unknown as Stripe.Event;

    const result = await processWebhookEvent(event, { onActivate, onInvoicePaid, onSuspend });
    expect(result.handled).toBe(true);
    expect(onSuspend).toHaveBeenCalledWith({
      tenantId: "acme",
      stripeCustomerId: "cus_abc",
      stripeSubscriptionId: "sub_123",
    });
  });

  it("marks unrecognized events as not handled", async () => {
    const event = {
      type: "payment_intent.created",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const result = await processWebhookEvent(event, {
      onActivate: vi.fn(),
      onInvoicePaid: vi.fn(),
      onSuspend: vi.fn(),
    });
    expect(result.handled).toBe(false);
  });
});

// ─── Suspension flow ──────────────────────────────────────────────────────────

describe("suspension flow", () => {
  it("quota check blocks tenant after subscription deletion webhook fires", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_fake";

    // Simulate a subscription that was active
    const sub: Subscription = {
      tenantId: "betacorp",
      planId: "starter",
      status: "active",
      currentPeriodStart: "2026-06-01T00:00:00Z",
      currentPeriodEnd: "2026-07-01T00:00:00Z",
    };

    // Before deletion: allowed
    const before = checkQuota({
      tenantId: "betacorp",
      billingConfig: { enabled: true },
      subscription: sub,
      messagesThisPeriod: 10,
      channelsActive: 1,
    });
    expect(before.allowed).toBe(true);

    // Simulate onSuspend updating the subscription record
    const suspended: Subscription = { ...sub, status: "suspended", suspendedAt: new Date().toISOString() };

    // After deletion: blocked
    const after = checkQuota({
      tenantId: "betacorp",
      billingConfig: { enabled: true },
      subscription: suspended,
      messagesThisPeriod: 10,
      channelsActive: 1,
    });
    expect(after.allowed).toBe(false);
    expect(after.error?.reason).toBe("suspended");

    delete process.env["STRIPE_SECRET_KEY"];
  });
});
