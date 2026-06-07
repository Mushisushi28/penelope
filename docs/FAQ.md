# Frequently Asked Questions

---

## What is Penelope?

Penelope is a small-business operating system that runs in your terminal
and talks to your customers so you don't have to.

You connect your messaging channels (Telegram, FB Messenger, SMS, email),
describe your business, and Penelope handles inbound customer conversations,
follow-up sequences, review asks, and content scheduling — all routed
through a head agent that talks to you via a private Telegram bot. Each
capability is a Specialist that runs on an internal bus; only Penelope (the
head agent) surfaces things to the owner.

---

## How is this different from Cal.com / Zapier / n8n / OpenAI agents?

**Cal.com** is a booking scheduler. Penelope is not a scheduler — it is the
layer that has the customer conversation, decides whether to book, and can
hand off to a booking tool.

**Zapier / n8n** are workflow automation platforms. They connect APIs via
static trigger-action graphs. Penelope reasons about customer intent and
business context; the logic is not a static graph.

**OpenAI Agents SDK** provides primitives for building LLM agents. Penelope
is a complete small-business runtime built on top of those primitives. You
do not configure agent topology — you describe your business and Penelope
figures out which specialists to invoke.

The honest difference: Penelope is opinionated about the small-business
use case. That makes it faster to get running and harder to generalize.

---

## Can I self-host?

Yes. Penelope is MIT licensed — you own everything you run. See
[docs/DEPLOY.md](DEPLOY.md) for the full setup guide. The minimum
requirements are Node 22, a Telegram bot token, and an Anthropic API key.
Docker Compose setup is included.

---

## How much does it cost?

Self-hosted: free. LLM API costs are on you — Claude Haiku on a typical
small business load (dozens of customer threads per day) runs well under
$10/month.

A hosted version where you sign up and skip the infrastructure is on the
roadmap but not shipped yet.

---

## What LLMs does it support?

- **Anthropic Claude** — default and primary target. Haiku for routine
  customer responses; Sonnet for drafts that need more nuance.
- **OpenAI-compatible** — any provider that exposes an OpenAI-compatible
  `/chat/completions` endpoint works via the model config.
- **Ollama** — supported for self-hosted local inference. Latency
  expectations differ; not tested at scale.

The model is configured per tenant in `tenant.json`. You can run different
models for different specialists if you want.

---

## Multi-tenant?

Yes. Each tenant gets:
- An isolated bus (SQLite database in `state/<tenant_id>/`)
- Isolated secrets (never shared across tenants)
- An isolated audit log
- Separate dashboard port (configurable)

Running multiple tenants from one Penelope process is supported.

---

## Does it work with WhatsApp / Instagram / TikTok / X?

Current adapter status:

| Channel | Status | Notes |
|---|---|---|
| Telegram (owner) | Shipped | Owner command channel |
| FB Messenger | Shipped | Customer channel; 24h window enforced |
| Twilio SMS | Shipped | Inbound + outbound |
| Email (IMAP/SMTP) | Shipped | Inbound polling + SMTP outbound |
| WhatsApp Business | Shipped | Cloud API; webhook + poll; template required outside 24h window |
| Instagram DM | Stub | Interface implemented; real Graph API calls are TODO. Requires App Review for `instagram_manage_messages` permission — not yet applied. |
| TikTok | Not started | Roadmap |
| X (Twitter) | Not started | Roadmap |
| loom-a2a (internal) | Shipped | Internal bus adapter; not a customer channel |

"Stub" means the adapter file exists, the `ChannelAdapter` interface is
fully implemented (TypeScript compiles, tests pass), but the actual API
calls are TODO placeholders. Do not use stubs in production.

---

## How do specialists communicate with each other?

They do not communicate with each other directly. All inter-agent
communication goes through the internal bus (loom-a2a). Penelope (the head
agent) is the only agent that reads from and writes to the owner channel
(Telegram). Specialists publish results to bus topics; Penelope decides
what the owner sees.

This is enforced at the code level — `SpecialistAgent.acquireTelegramOwnerAdapter()`
throws a hard error at runtime.

---

## Is data sent to a third party?

Only to the LLM provider you configure (Anthropic by default). All
conversation history, customer data, tenant config, and audit logs live in
SQLite on your machine (or your server). Nothing is sent to Penelope
infrastructure — there is no Penelope infrastructure.

If you use Twilio for SMS, your messages pass through Twilio's infrastructure
per their terms. Same for FB Messenger via Meta's Graph API.

---

## What are the Wave-1 MCP connectors?

The Wave-1 connector registry (`packages/connectors/src/mcp-registry/`) wires 27
popular SaaS tools as first-class Penelope connectors using descriptor-only metadata
— no packages are bundled in this repo. Each descriptor declares:

- **mcp_server** — the npm package to spawn (e.g. `@stripe/agent-toolkit`)
- **capabilities** — verb.noun ops the server exposes (e.g. `payment.list`, `payment.charge`)
- **required_env** — env vars the tenant must supply
- **owner_consent_required** — capabilities that need an explicit approval token before dispatch (charging money, sending messages, running payroll, etc.)
- **tenant_config_template** — schema for the tenant's config block

At runtime, the connector router (`packages/agents/src/specialists/connector-router.ts`)
checks env vars and consent gates before approving dispatch. The MCP Host specialist
then spawns the declared server on demand.

Covered P0 categories: Payments, CRM, Inbox, Booking, Email/SMS, Accounting, Reviews,
Helpdesk, Voice AI, Payroll — plus Asana/ClickUp/Linear, PandaDoc, Tally, Zapier,
PostHog, Mixpanel, ShipStation, inFlow, Chargebee, Canva, Twilio.

---

## What is Loom?

Loom is the private engine Penelope runs on. Penelope is the public
packaging of the small-business OS layer that sits on top of it.

---

## Is Penelope production-ready?

Honest answer: in active production use by a mobile auto-service business as of June 2026.

What is shipped and running:
- Wave A specialists: FollowUpSpecialist, MarketingSpecialist,
  ContentSpecialist (with scheduler)
- FB Messenger + Twilio SMS + Telegram owner channel adapters
- Multi-tenant bus, secrets, audit log, dashboard

What is on the roadmap (not shipped):
- Wave B specialists: Social, Finance, Team
- Instagram DM (waiting on App Review)
- Hosted / managed version
- Marketplace for tenant templates

Expect rough edges. The API surface is still moving. If you build on
Penelope today, pin to a specific commit and review the changelog before
upgrading.
