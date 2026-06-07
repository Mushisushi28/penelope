# auto-service example tenant

Reference implementation for a mobile auto-service business using Penelope.

This template demonstrates the vertical configuration for any mobile service
business where a technician travels to the customer.

## What's here

```
tenant.json                          — tenant config (vertical, channels, pricing)
procedures/
  customer-inbound-fb.yaml           — FB Messenger DM → qualify → quote → book
  quote-builder.yaml                 — vehicle + condition → compute final quote
  payment-reconciler.yaml            — payment received → mark paid → trigger review-ask
  review-ask.yaml                    — 1h post-job → send Google/Facebook review request
agents/
  customer-frontend.persona.yaml     — specialist persona stub
```

## Pricing tiers

| id       | floor | ceiling | auto-quote band | notes                          |
|----------|-------|---------|-----------------|--------------------------------|
| standard | $X    | $Y      | $X–$X+50        | base service level             |
| premium  | $Y    | $Z      | $Y–$Y+60        | extended warranty / coating    |

Replace the placeholder price floors/ceilings in `tenant.json` with your actual
pricing. All values in your tenant's currency.

## Env vars required

Copy `.env.example` in your tenant dir and fill in:

```
TENANT_FB_PAGE_TOKEN=          # Facebook Page Access Token
TENANT_FB_PAGE_ID=             # Facebook Page numeric ID
TENANT_PENELOPE_BOT_TOKEN=     # Telegram bot token (owner notifications)
TENANT_OWNER_CHAT_ID=          # Your Telegram numeric chat ID
TENANT_SQUARE_ACCESS_TOKEN=    # Square sandbox or production key
TENANT_SQUARE_LOCATION_ID=     # Square location ID
TENANT_CALENDLY_URL=           # Your Calendly booking page URL
TENANT_GOOGLE_REVIEW_URL=      # Google review link
TENANT_FB_REVIEW_URL=          # Facebook reviews link
```

## Channel flow

1. Customer DMs the Facebook Page.
2. `customer-inbound-fb` procedure fires.
3. Specialist qualifies the job, computes quote via `quote-builder`.
4. Sends booking link (Calendly).
5. After payment lands, `payment-reconciler` marks the job paid and schedules review-ask.
6. `review-ask` fires 1h later via SMS or FB Messenger thread.

## Adapting for your vertical

- Update `tenant.json` with your business name, city, hours, and pricing floors.
- Edit procedure YAML files to match your service's qualification questions and voice.
- Replace placeholder env var values in `.env.example` with your actual credentials.
