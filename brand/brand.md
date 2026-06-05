# Penelope — Brand Guide
**v1.0 · 2026-06-04**

---

## Origin

In Homer's *Odyssey*, Penelope is left to run the kingdom of Ithaca for twenty years while her husband Odysseus fights at Troy and wanders the wine-dark sea.

She does not wait passively. She manages the household, navigates suitors, governs the estate, and preserves the family's position — all through intelligence, patience, and strategy. Her famous device: weaving a shroud by day and undoing the work by night, buying herself time. She is the original autonomous operator.

**Penelope, the product**, follows this metaphor exactly:

- The **loom** is the engine (Loom — the underlying SDK and platform).
- The **weaving** is the work: conversations handled, invoices sent, bookings confirmed, follow-ups fired.
- The **thread** is the Telegram interface — the single line of communication through which everything passes.
- The **undoing** is iteration — the system learns, rewrites its own patterns, improves overnight.
- **Odysseus** is the business owner — away, at sea, needed elsewhere. Penelope makes his absence possible.

Penelope is not a chatbot. She is not an assistant. She is the queen running the kingdom. The owner is optional on any given Tuesday.

---

## Companion Products

| Name | Role | Metaphor |
|---|---|---|
| **Loom** | The engine, the SDK | The loom itself — the structure that makes weaving possible |
| **Penelope** | The operator OS, Telegram-first | The queen who runs the kingdom while Odysseus is away |
| **Odysseus** | The dashboard, the visual interface | The hero's return — where you see the whole story laid out |

They are designed to be used together but can stand alone. Penelope is the face to the world. Loom is the spine. Odysseus is where the owner looks when they come home.

---

## Voice & Tone

### Three adjectives
- **Capable** — she has already handled it. Past tense. Done.
- **Precise** — no fluff. Every word carries freight.
- **Warm** — a trusted operator, not a cold machine. She knows your business.

### Three anti-adjectives (what Penelope is NOT)
- **Chatty** — no pleasantries unless they serve a purpose
- **Apologetic** — she doesn't preface action with "I'll try to..."
- **Corporate** — no passive voice, no buzzwords, no SaaS-speak

### Voice in practice

| Don't say | Say instead |
|---|---|
| "I'd be happy to help you with that!" | "On it." |
| "Unfortunately, I was unable to process..." | "Booking failed — Square returned a timeout. Retrying." |
| "Leveraging our AI-powered solution..." | "She runs the home while Odysseus is away." |
| "Here are some options you might consider..." | "Sent the quote. Joshua gets it in 3 minutes." |
| "I apologize for any confusion..." | "Correction: the 2pm slot was already taken. Moved to 3pm." |

---

## Tagline

**Primary:** *She runs the home while Odysseus is away.*

This is the north star. It is the myth, the product promise, and the user's relief, in one sentence. Do not shorten it. Do not punctuate it differently. It is always lowercase except in contexts where sentence case is structurally required.

### Alternates (ordered by context-fit)

1. *The business that runs itself — distilled to one chat.*
   — For install READMEs and technical docs. Leads with the value prop.

2. *One thread. Every customer. Nothing missed.*
   — For marketing copy, product pages. Double meaning: Telegram thread / loom thread.

3. *Your business doesn't need you today.*
   — Bold, provocative. For landing page hero sections. Use with restraint.

4. *She weaves. You wander.*
   — Literary pairing to the primary tagline. Good for posters, visual identity moments.

5. *The loom keeps weaving.*
   — For CLI output on successful operation, server health messages. Understated.

---

## Naming Conventions

### Commands
Penelope commands are lowercase, hyphenated. The CLI binary is `penelope`.

```
penelope start
penelope status
penelope logs --follow
penelope channel add telegram
penelope skill install dhr-responder
```

### Subdomains / services
Prefer mythological names for internal services and named infrastructure:

| Service | Name | Rationale |
|---|---|---|
| Webhook ingress | `herald.penelope.run` | Hermes, messenger of the gods |
| Storage / persistence | `vault.penelope.run` | The treasury of Ithaca |
| Dashboard (Odysseus) | `app.penelope.run` | Where the owner comes home to |
| Status page | `ithaca.penelope.run` | The kingdom — its health is visible |

### File paths (internal)
```
packages/core/          — the loom core
packages/cli/           — the penelope CLI
packages/channels/      — Telegram, FB, SMS adapters
packages/skills/        — pluggable business logic
packages/storage/       — vault adapters
examples/               — working small business setups
```

### Environment variables
All Penelope env vars use the `PENELOPE_` prefix:
```
PENELOPE_TELEGRAM_TOKEN
PENELOPE_BOT_NAME
PENELOPE_STORAGE_URL
PENELOPE_LOG_LEVEL
```

---

## Logo Usage Guidelines

### Clear space
Maintain a minimum clear space of **1× the height of the letter "p"** on all sides of the logo mark, and **0.5× the wordmark height** around the full wordmark.

### Minimum sizes
| Use case | Minimum size |
|---|---|
| Favicon / app icon | 16px |
| Inline / body text badge | 24px |
| Header / nav | 32px |
| Print / large format | No minimum (vector) |

### Color variants
- **Primary:** Deep olive `#2D4A3E` on bone-white `#F6F3EC` or transparent
- **Reversed:** Bone-white `#F6F3EC` on deep olive `#2D4A3E` (dark backgrounds)
- **Monochrome:** Full black `#141410` or pure white `#FFFFFF` only when brand colors are unavailable
- **Single-color embossed:** Logo mark only, at 20% opacity over brand color fills

### Do
- Use the provided SVG files — never recreate the mark by hand
- Use the wordmark when there is space; use the mark alone at small sizes
- Maintain the aspect ratio
- Allow the mark to breathe (clear space rule)

### Don't
- Don't rotate, skew, or distort the mark
- Don't apply drop shadows, gradients, or filters
- Don't use on backgrounds that reduce contrast below 4.5:1
- Don't combine the Penelope mark with competitor logos in marketing materials
- Don't use purple gradients on white. Ever.

---

## Palette Quick Reference

| Token | Hex | Use |
|---|---|---|
| `--penelope-loom` | `#2D4A3E` | Primary — deep Ithaca olive |
| `--penelope-thread` | `#C9983F` | Accent — warm gold |
| `--penelope-shuttle` | `#A0522D` | Interactive — copper |
| `--penelope-weft-base` | `#FDFCFA` | Page background |
| `--penelope-weft-raised` | `#F6F3EC` | Card surface |
| `--penelope-warp-high` | `#141410` | Primary text |

Full token definitions: `palette.css`

---

## Typography Quick Reference

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / h1–h4 | Cormorant Garamond | 300–400 | Italic sparingly — it's expressive |
| UI / h5–h6 / body | IBM Plex Sans | 300–600 | All body copy, navigation, labels |
| Code / terminal | JetBrains Mono | 400–500 | CLI output, code blocks, IDs |

Full definitions: `typography.css`

---

## Sample Applications

### Command-line install banner
See `banner-ascii.txt` — displayed on `penelope start` first run and in README install sections.

### Telegram welcome message
When Penelope first connects to a Telegram business, she sends:

```
ready.

i'm penelope. i'll handle your messages, bookings, and follow-ups from here.
you don't need to babysit me — but you can if you want.

type /status to see what i'm watching.
type /help to see what i can do.

the loom keeps weaving.
```

Voice notes: all lowercase, no punctuation grandstanding, confident not chatty.

### Install header (README / docs)

```
penelope v0.1 — she runs the home while Odysseus is away
─────────────────────────────────────────────────────────
engine:  loom (https://github.com/Mushisushi28/loom)
surface: odysseus (https://github.com/Mushisushi28/odysseus)
channel: telegram-first
```

### Odysseus dashboard page title format
```
Penelope — [Business Name] · [Section]
```
Example: `Penelope — Dobson Headlight Restoration · Inbox`

---

## Relationship to Companion Brands

**Loom** is technical, infrastructure-first. Its brand is neutral/dark — the engine room. When Penelope references Loom, it is honest about the plumbing.

**Odysseus** inherits Penelope's palette but leads with data density. Its brand is the same deep olive and gold, but the typography shifts to sans-first for dashboard contexts. Odysseus is where you read; Penelope is where things happen.

The three form a mythology-coherent family: the loom (structure), the queen (operation), the hero (return and oversight). They can be sold separately but are designed to be one.

---

*Penelope brand guide — maintained in `brand/brand.md`. Update this file when brand decisions change.*
