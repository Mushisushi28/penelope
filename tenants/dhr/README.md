# DHR — Canonical Penelope Tenant

**Dobson Headlight Restoration** is the first real tenant in the Penelope system. It is not a demo. It is a live mobile headlight-restoration business in Lethbridge, AB that has been running a production responder since 2025.

This tenant proves the Penelope tenant model works on a real business.

## Relationship to the Production DHR Bot

The production responder lives on Weekend Linux at `/home/dhrbot/responder/`. It runs as a standalone systemd service (`dhrbot-responder.service`) and handles Facebook Messenger DMs via the Graph API directly.

| Attribute | Production (Weekend Linux) | Penelope DHR tenant |
|---|---|---|
| Location | `/home/dhrbot/responder/` | `tenants/dhr/` |
| Trigger | loom-a2a bus event `new_customer_message` | `inbound_message` on `fb-page` channel |
| State | `/home/dhrbot/responder/state/thread_states.json` | Penelope state layer |
| Conversation flow | "Grandfather Formula" steps in `responder.md` | `customer-inbound-fb.yaml` states |
| Pricing | Hardcoded in `responder.md` | `tenant.json` pricing array + `quote-builder.yaml` |
| Quiet hours | Edmonton check before every send | `quiet_hours` in `tenant.json`, enforced in `review-ask.yaml` |

The voice, pricing, and conversation logic in this tenant are sourced directly from the live `responder.md` prompt.

## What Is Hardcoded vs Configurable

**Hardcoded in this tenant** (matches production canonical):
- Pricing floors/caps: standard $100-200, ceramic $200-250
- Quiet hours: 22:00-09:00 MDT (America/Edmonton)
- Service area: Lethbridge AB and Southern Alberta
- Voice rules: lowercase, 1-2 sentences, no formal openers, "we come to you"
- Booking provider: Calendly (fridays/saturdays 11am-5pm)
- Payment processor: Square

**Configurable via environment variables** (not in repo):
- `DHR_FB_PAGE_TOKEN` — Facebook Page Access Token
- `DHR_FB_PAGE_ID` — Facebook Page ID (currently 815642964958116 in prod)
- `DHR_SQUARE_ACCESS_TOKEN` — Square API key
- `DHR_SQUARE_LOCATION_ID` — Square location
- `DHR_CALENDLY_URL` — Calendly booking link
- `DHR_GOOGLE_REVIEW_URL` — Google review link
- `DHR_FB_REVIEW_URL` — Facebook review link
- `DHR_TEXTNOW_SESSION` — TextNow session cookie
- `DHR_JARVIS_BOT_TOKEN` — Telegram bot for owner escalations
- `DHR_OWNER_CHAT_ID` — Isaac's Telegram chat ID

Copy `.env.example` (repo root) and fill these in before running.

## Procedures

| File | Purpose |
|---|---|
| `procedures/customer-inbound-fb.yaml` | FB Messenger inbound handler — qualify, quote, book |
| `procedures/quote-builder.yaml` | Pricing formula — base + condition + size + brand modifiers |
| `procedures/payment-reconciler.yaml` | Square payment poll → match to job → trigger review ask |
| `procedures/review-ask.yaml` | 1h post-payment review request with quiet-hours guard |

## Voice (verbatim from live responder)

> "hey! what kind of vehicle do you have?"
> "are they pretty hazy or just starting to yellow?"
> "for your f150 with hazy lights you are looking at $130-$150 for the pair, standard finish with a 1 year warranty. we come to you in lethbridge."
> "here is the booking link: [url] -- fridays and saturdays 11am-5pm"

Never uses "Hi", "Hello", "I'd be happy to", bullet points, markdown, or reveals AI identity.

## Pricing (canonical — do not deviate)

Standard restoration:
- base = $50 x num_lights (default 2 = $100)
- condition modifier: mild +$0, moderate +$15-25, heavy/cracked clear coat +$30-50
- size modifier: truck/SUV/van +$10-20
- brand modifier: Audi/BMW/euro luxury +$10-20
- clamp: floor $100, cap $200

Ceramic coating:
- standard result + $80-100 surcharge
- clamp: floor $200, cap $250
- 3-year warranty vs 1-year standard

## Secrets

Actual credentials live in `.secrets/` (gitignored). The `.gitkeep` is the only committed file there.
