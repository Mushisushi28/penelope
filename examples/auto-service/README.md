# auto-service example tenant

Reference implementation for an auto headlight restoration business using Penelope.

Based on the DHR (Dobson Headlight Restoration) operational model.

## What's here

```
tenant.json                          — tenant config (vertical, channels, pricing)
procedures/
  customer-inbound-fb.yaml           — FB Messenger DM → qualify → quote → book
  quote-builder.yaml                 — vehicle + condition → compute final quote
  payment-reconciler.yaml            — Square payment received → mark paid → trigger review-ask
  review-ask.yaml                    — 1h post-job → send Google/Facebook review request
agents/
  customer-frontend.persona.yaml     — specialist persona stub
dashboard/                           — per-tenant owner dashboard (next phase)
```

## Pricing tiers

| id       | floor | ceiling | auto-quote band | notes                    |
|----------|-------|---------|-----------------|--------------------------|
| regular  | $99   | $200    | $99–150         | standard restoration     |
| ceramic  | $200  | $250    | $200–240        | ceramic-coated, 2-3x life|

All prices in CAD. Quotes above the auto-quote band require `owner_telegram_confirm`.

## Channel flow

1. Customer DMs the Facebook Page.
2. `customer-inbound-fb` procedure fires.
3. Specialist qualifies vehicle, computes quote via `quote-builder`.
4. Sends booking link (Calendly).
5. After Square payment lands, `payment-reconciler` marks the job paid and schedules review-ask.
6. `review-ask` fires 1h later via SMS.
