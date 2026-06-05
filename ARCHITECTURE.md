# Penelope — Architecture

> "She runs the home while Odysseus is away."

Penelope is a self-hosted, Telegram-first OS for a small business. One Telegram chat replaces every digital tool — CRM, inbox, quoting, booking, payments, reviews, marketing. Customers keep using the channels they already have (Facebook Messenger, SMS, email, Instagram). The owner talks to one bot.

---

## System diagram

```
  OWNER
   │
   │ Telegram
   ▼
┌──────────────────────────────────────────────────────────────┐
│  OWNER-AGENT (CEO bot)                                       │
│  Natural-language meta-router — biz-domain intent parser     │
│  Per-tenant persona + config                                 │
└────────────────────────────┬─────────────────────────────────┘
                             │  loom a2a bus (per-tenant SQLite)
         ┌───────────────────┼────────────────────────┐
         │                   │                        │
   ┌─────▼─────┐      ┌──────▼──────┐        ┌───────▼──────┐
   │ CUSTOMER  │      │  BOOKING /  │        │  PAYMENTS /  │
   │  AGENT    │      │  QUOTING    │        │  REVIEWS /   │
   │           │      │  AGENTS     │        │  MARKETING   │
   └─────┬─────┘      └──────┬──────┘        └───────┬──────┘
         │                   │                        │
         │           CHANNEL ADAPTERS                 │
         │    ┌──────────────┼──────────────┐         │
         │    │              │              │         │
    ┌────▼────▼─┐  ┌─────────▼───┐  ┌──────▼──────┐  │
    │ FB PAGE   │  │   TWILIO    │  │    SMTP      │  │
    │ MESSENGER │  │    SMS      │  │    EMAIL     │  │
    └───────────┘  └─────────────┘  └─────────────┘  │
                                                      │
                              INTEGRATIONS            │
               ┌──────────────┬───────────┬───────────┘
               │              │           │
         ┌─────▼──┐   ┌───────▼──┐  ┌────▼───────┐
         │ STRIPE │   │ GOOGLE   │  │  SQUARE /  │
         │        │   │ CALENDAR │  │  CALENDLY  │
         └────────┘   └──────────┘  └────────────┘

  ┌──────────────────────────────────────────────┐
  │  TENANT DB  (per business)                   │
  │  customers · threads · jobs · quotes         │
  │  payments · audit_log · procedures           │
  │  SQLite default → Postgres optional          │
  └──────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────┐
  │  ODYSSEUS DASHBOARD  (secondary surface)     │
  │  Owner web UI — deep CRM, analytics,         │
  │  content editing, contract signing           │
  │  Reads bus.sqlite per tenant (read-only)     │
  └──────────────────────────────────────────────┘
```

---

## Data flow — inbound customer message

```
Customer DMs Facebook Page
        │
        ▼
FB webhook POST → /adapters/facebook/webhook
        │
        ▼
ChannelAdapter.normalize() → InboundChannelMessage
        │
        ▼
loom-a2a bus: publish("customer.message.inbound", payload)
        │
        ▼
customer-agent subscribes, classifies intent:
  ├─ quote request    → publishes "quote.requested"   → quoting-agent
  ├─ booking request  → publishes "booking.requested" → booking-agent
  ├─ payment query    → publishes "payment.queried"   → payments-agent
  └─ general inquiry  → drafts reply, publishes "customer.reply.ready"
        │
        ▼
owner-agent reviews (if approval_required) or auto-sends
        │
        ▼
ChannelAdapter.send() → FB Send API response
```

---

## Tenancy model

Each business ("tenant") is fully isolated:

```
data/
  tenants/
    <slug>/
      config.yaml      — business name, pricing rules, channels enabled,
                          approval gates, quiet hours, service area, voice/tone
      .env             — per-tenant secrets (FB token, Stripe key, Twilio SID)
  state/
    tenants/
      <slug>/
        biz.sqlite     — customers, threads, jobs, quotes, payments, audit_log
        bus.sqlite     — loom a2a message bus for this tenant
        procedures/    — compiled procedure YAML cache
```

Tenants never share a database connection. Adding a new tenant is `penelope tenant add --slug=acme`.

---

## Security model

**Per-tenant secret isolation**
Credentials live in `data/tenants/<slug>/.env`, never in the shared process environment. Each tenant's env is loaded at startup and scoped to that tenant's agent instances only.

**Audit log**
Every outbound message, every action (quote sent, booking created, payment link generated) is written to `audit_log` in the tenant's SQLite with timestamp, agent, channel, and payload hash. Immutable append-only (no UPDATE/DELETE on audit_log).

**Owner-only command surface**
The owner-agent only accepts commands from the configured `OWNER_TELEGRAM_CHAT_ID`. All other Telegram senders are rejected at the adapter level before any LLM call.

**Quiet-hours enforcement**
Proactive outbound (review asks, follow-ups, marketing) is blocked between 22:00–09:00 local tenant time. Configurable per tenant. Applied in the adapter before any API call.

**No plaintext secrets in logs**
All log output is filtered through a redactor that replaces known secret patterns (tokens, API keys, phone numbers beyond last 4 digits) with `[REDACTED]`.

**Webhook signature verification**
Every inbound webhook (Facebook, Stripe, Twilio) is verified against its signing secret before the payload is processed. Invalid signatures are rejected with 403 before any agent code runs.

---

## Extending Penelope

### Adding a custom channel adapter

1. Create `packages/adapters/src/channels/your-channel/index.ts`.
2. Implement the `ChannelAdapter` interface:
   ```typescript
   interface ChannelAdapter {
     name: string;
     normalize(raw: unknown): InboundChannelMessage;
     send(message: OutboundChannelMessage): Promise<void>;
     verifyWebhook?(req: Request): boolean;
   }
   ```
3. Register it in `packages/adapters/src/index.ts`.
4. Add the required env vars to `.env.example` with comments.

### Adding a custom specialist agent

1. Create `packages/agents/src/specialists/your-agent.ts`.
2. Subscribe to the relevant bus events using `bus.subscribe('event.name', handler)`.
3. Publish results back to the bus for downstream agents.
4. Register the agent in `packages/agents/src/index.ts`.

### Adding a custom procedure

Procedures are YAML files that define multi-step workflows (e.g. the quoting flow, the review-ask sequence). Add a procedure YAML to `data/tenants/<slug>/procedures/` and it is picked up on next restart.

Example procedure skeleton:
```yaml
id: custom-followup
trigger: job.completed
steps:
  - wait: 2h
  - send:
      channel: sms
      template: post-job-followup
  - if_no_reply:
      after: 24h
      send:
        channel: email
        template: review-ask
```

---

## Key packages

| Package | Role |
|---|---|
| `@penelope/core` | Tenant model, procedure loader, bus client |
| `@penelope/agents` | Owner-agent, meta-router, specialists |
| `@penelope/adapters` | Channel adapters (FB, Twilio, SMTP) + integration connectors |
| `@penelope/cli` | `penelope` CLI — `init`, `up`, `doctor`, `tenant` commands |
| `@penelope/dashboard` | Odysseus-themed owner dashboard (vanilla JS, Node HTTP) |

---

## Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Database | SQLite (better-sqlite3) | Zero-ops, tenant-isolated, 1M+ rows/s |
| Postgres | Optional via DATABASE_URL | Replaces SQLite for multi-host setups |
| Message bus | loom-a2a over SQLite | Same transport as the broader Loom platform |
| CLI | Commander.js + Inquirer | Standard Node CLI stack, zero native deps |
| Dashboard | Vanilla JS, Node HTTP | No bundler, no framework lock-in |
| Build | TypeScript + tsc | Per-package, no monorepo build tool required |
| Container | Alpine-based Node 20 | Smallest attack surface, fast pull |
