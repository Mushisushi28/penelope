# @penelope/agents

Owner-agent (CEO bot) + meta-router + specialist agents for Penelope.

## Overview

This package delivers:
- **Owner-agent persona template** — system prompt rendered per-tenant via Nunjucks
- **Meta-router** — pattern-matches natural-language owner Telegram messages → typed dispatch envelopes
- **Specialist agents** — 7 specialists covering the full business operations loop

## Specialists

| Specialist | File | Status |
|---|---|---|
| Customer Frontend | `customer-frontend.persona.template.md` | Template (real) |
| Quote Builder | `quote-builder.ts` + `.persona.template.md` | Real formula |
| Daily Brief | `daily-brief.ts` | Real |
| Booking | `booking.ts` + `.persona.template.md` | Real logic, stub calendar API |
| Payment Reconciler | `payment-reconciler.ts` | Real logic, stub Square/Stripe API |
| Review Ask | `review-ask.ts` | Real |
| Marketing | `marketing.ts` + `.persona.template.md` | Real queue/approval, stub publish |

## Principle

80% generic template config, 20% tenant-specific. No hardcoded business names or service types anywhere.

## Usage

```ts
import { route, buildEnvelope, renderPersona, buildQuote } from "@penelope/agents";

// Route an owner message
const match = route("draft a quote for a 2018 silverado pair, heavy oxidation", tenantId);

// Render a persona
const prompt = renderPersona("./src/owner-agent/persona.template.md", tenantConfig);

// Build a quote
const quote = buildQuote(jobInput, pricingConfig);
```

## Tests

```bash
npm test
```

Covers: meta-router intent matching (22 cases), quote formula correctness (8 cases), persona render edge cases (12 cases).

## Intent Count

The meta-router defines **11 named intents** covering 40+ pattern variations.
