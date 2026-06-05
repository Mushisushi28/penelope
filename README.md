<div align="center">

# penelope

**she runs the home while Odysseus is away.**

a self-hosted, telegram-first operating system for a small business that runs itself.

[![CI](https://github.com/Mushisushi28/penelope/actions/workflows/ci.yml/badge.svg)](https://github.com/Mushisushi28/penelope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](https://github.com/Mushisushi28/penelope/releases)

[quickstart](docs/QUICKSTART.md) - [install](INSTALL.md) - [architecture](ARCHITECTURE.md) - [contributing](CONTRIBUTING.md)

</div>

---

## what is this

A small business that lives in your phone.

You point Penelope at your Facebook Page, your SMS line, your email, and your calendar. She handles inbound DMs, qualifies leads, drafts quotes within your pricing rules, books appointments, follows up on payments, asks for reviews, and pings you with a daily brief.

You only see the parts that need you. Everything else happens in one telegram chat with your agent.

## features

### messaging across every channel
- Facebook Page Messenger (Graph API, 24h-window aware)
- Twilio SMS (real per-tenant number) or TextNow DOM (free until you upgrade)
- Email via IMAP/SMTP (App Password or OAuth)
- Instagram DMs (stub, Meta Graph)
- Owner to agent: Telegram bot (per tenant)

### lead handling
- Per-vertical qualifying flow defined as a YAML procedure you can edit
- Auto-quote within configurable pricing caps (no quoting outside floor/ceiling, no fixed tiers)
- Calendar booking via Calendly or direct Google Calendar OAuth
- Post-job review-ask with platform-specific links (Google / Facebook)
- Payment reconciliation from Stripe and Square

### one telegram chat, every workflow
- "what's today look like" runs the daily brief and returns 8 bullets
- "send linnell the quote" looks up the customer, drafts, confirms before sending
- "draft a quote for a 2018 silverado pair, heavy oxidation" runs the quote-builder, returns the number
- "pause autopilot for the day" flips the flag, customer messages stack in a shadow queue
- "status" shows which channels are alive, queue depth, last inbound

### owner dashboard (secondary surface)
- Vanilla-JS, Odysseus-themed, PWA-installable on iOS / Android home screen
- Home brief, unified inbox, shadow-mode review queue, customer 360, quotes and bookings, money, agents, procedures, connectors, settings
- Tenant-themed (each business picks its own accent color)
- Runs locally at `http://localhost:18900` after install

### built-in compliance
- Per-tenant do-not-contact list
- No proactive outbound between 22:00 and 09:00 local (configurable)
- One-click opt-out injection in outbound
- 24-hour FB-window enforcement
- Append-only per-tenant audit log with tamper-detect hash chain

### marketplace + extensions
- Hermes connector loader, register any service with an OpenAPI spec
- Community-contributed connectors and procedure templates (sandbox-mode default, TOTP to promote)
- Procedure replay harness: test prompt/procedure changes against recorded threads before shipping

### multi-tenant from day one
- One business = one tenant directory under `tenants/<slug>/`
- Per-tenant bus, per-tenant secrets, per-tenant audit log
- Run multiple businesses from a single Penelope install

### voice (when you're driving)
- Voice memo to Whisper transcription to owner-agent
- Owner-agent to Smallest.ai TTS to voice reply
- Per-tenant voice character

## quickstart

```bash
npx penelope init
# 5 questions, 90 seconds. you're running.
```

Full walkthrough in [docs/QUICKSTART.md](docs/QUICKSTART.md).

## install paths

| path        | best for                                | command                    |
|-------------|-----------------------------------------|----------------------------|
| `npx`       | trying it out, single tenant, your box  | `npx penelope init`        |
| `npm -g`    | running on a server you own             | `npm i -g penelope`        |
| Docker      | running in production, multi-tenant     | `docker compose up -d`     |
| Web wizard  | onboarding a non-technical friend       | deploy `packages/onboarding-web` to Vercel |

Detailed steps for every path: [INSTALL.md](INSTALL.md).

## architecture (one page)

The owner uses one telegram chat. Their Penelope agent (head agent) reads tenant config and routes commands to specialist agents (customer, booking, quoting, payments, reviews, marketing, daily-brief) via the internal loom-a2a bus. Penelope is the only agent that talks to the owner on Telegram — specialists are bus-only. Each tenant gets its own SQLite bus, procedures, audit log, and secrets. The Odysseus dashboard is a secondary surface for deep dives.

Full architecture, tenancy model, security model, and extension guide in [ARCHITECTURE.md](ARCHITECTURE.md).

## packages

| package                       | what it does                                                     |
|-------------------------------|------------------------------------------------------------------|
| `@penelope/cli`               | `penelope init / up / status / tenant / send / doctor`           |
| `@penelope/core`              | tenant model, procedure YAML loader, schema validation           |
| `@penelope/adapters`          | telegram-owner (Penelope-only), fb-page, twilio-sms, imap-smtp, instagram, loom-a2a |
| `@penelope/agents`            | Penelope head agent + 7 specialists                              |
| `@penelope/dashboard`         | per-tenant Odysseus-themed PWA owner app                         |
| `@penelope/hermes`            | OpenAPI connector loader (Stripe / Calendly / Twilio)            |
| `@penelope/marketplace`       | community connector + procedure registry, sandbox to TOTP promote |
| `@penelope/procedure-eval`    | replay harness for procedure / prompt changes                    |
| `@penelope/telemetry`         | opt-in usage meter (counts only, never content)                  |
| `@penelope/audit-log`         | append-only per-tenant tamper-detect log                         |
| `@penelope/onboarding-web`    | Next.js install wizard for non-CLI users                         |

## verticals shipped

- `examples/auto-service` - full reference tenant (headlight restoration / mobile detailing pattern)
- `examples/home-services` - cleaning / lawn / handyman starter
- `examples/personal-services` - barber / salon starter

Plug your own vertical: copy any example, edit `tenant.json` and `procedures/`, run `penelope tenant add`.

## status

**Pre-alpha.** v0.1 ships the foundations:

- Tenant model + procedure loader
- Channel adapters (telegram, fb-page, twilio, smtp; instagram stub)
- Owner-agent + 7 specialists
- CLI + Docker deploy
- Marketplace + procedure eval
- Per-tenant owner dashboard
- Web onboarding wizard
- Hermes connector loader
- Audit log + opt-in telemetry

What's not in v0.1 (coming in v0.2 - v0.4):

- Per-tenant Stripe billing (managed tier)
- WhatsApp adapter
- Instagram inbound (currently stub)
- Per-tenant secrets vault on OS keychain
- Shadow to live auto-promotion threshold
- Full IDE-grade procedure YAML editor in the dashboard

See [milestones](https://github.com/Mushisushi28/penelope/milestones) for the live roadmap.

## companion projects

- [loom](https://github.com/Mushisushi28/loom) - the multi-agent engine Penelope runs on
- [odysseus](https://github.com/Mushisushi28/odysseus) - the self-hosted AI workspace whose design language Penelope's dashboard uses

## contributing

PRs welcome on bugs, new channel adapters, new vertical templates, and procedure improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## license

MIT. See [LICENSE](LICENSE).

## security

Report vulnerabilities via [GitHub Security Advisories](https://github.com/Mushisushi28/penelope/security/advisories/new). Details in [SECURITY.md](SECURITY.md).
