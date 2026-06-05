# @penelope/billing

Per-tenant Stripe billing for Penelope. Fully opt-in — self-hosted users pay nothing.

## Activation

Billing runs only when **both** conditions are true:

1. `STRIPE_SECRET_KEY` is set in the environment
2. The tenant's `tenant.json` contains `billing: { enabled: true }`

No env var, no billing. No config flag, no billing. Default is always OFF.

## Plans

| Plan | Price | Channels | Messages/mo | Tenants |
|------|-------|----------|-------------|---------|
| Free | $0 | 1 | 500 | 1 |
| Starter | $99/mo | 5 | 10,000 | 3 |
| Pro | $199/mo | 20 | 100,000 | 20 |

Set `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` env vars to your Stripe Price IDs.

## Modules

- **`types.ts`** — Plan, Subscription, MeteredUsage, Invoice types
- **`plans.ts`** — Plan definitions, `getPlan()`, `isOverQuota()`
- **`stripe-client.ts`** — createCustomer, createSubscription, recordMeteredUsage, listInvoices, voidSubscription
- **`quota-middleware.ts`** — `checkQuota()` (pure, no side effects), `InMemoryUsageStore`
- **`usage-collector.ts`** — `collectAndReport()` daily cron helper, `buildUsageSnapshot()`
- **`webhook-handler.ts`** — `createWebhookHandler()` Express factory; handles `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`

## Webhook setup

```ts
import express from "express";
import { createWebhookHandler } from "@penelope/billing/webhook-handler";

app.post(
  "/billing/webhook",
  express.raw({ type: "application/json" }),
  createWebhookHandler({
    callbacks: {
      async onActivate({ tenantId, stripeSubscriptionId, planId }) {
        // update your tenant store
      },
      async onInvoicePaid({ tenantId }) {
        // mark subscription active
      },
      async onSuspend({ tenantId }) {
        // set subscription.status = "suspended"
      },
    },
  })
);
```

## Development

```bash
npm install
npm test
npm run build
```
