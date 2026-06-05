# @penelope/onboarding-web

> She runs the home while Odysseus is away.

The Penelope onboarding wizard — a Next.js 14 web app that walks a small-business owner through a five-step setup flow and generates a ready-to-use `tenant.json` config (or pushes it directly to a live Penelope instance).

**No CLI required.** Fill out the wizard, download your zip, unzip alongside your `penelope` install, and run `penelope up`.

---

## Quick start (local)

```bash
cd packages/onboarding-web
cp .env.example .env.local
npm install
npm run dev
# → http://localhost:3000
```

The dev server hot-reloads. Open `http://localhost:3000` for the marketing landing page or `http://localhost:3000/setup` to jump straight to the wizard.

---

## Deploy to Vercel

### One-click from CLI

```bash
cd packages/onboarding-web
npx vercel deploy --prod
```

Vercel auto-detects the Next.js framework from `vercel.json`. No further config required for the default stub mode (zip download only).

### Environment variables

Set these in the Vercel dashboard (or via `vercel env add`) to enable live-instance push:

| Variable | Required | Description |
|---|---|---|
| `PENELOPE_INSTANCE_URL` | optional | Base URL of a running Penelope instance (e.g. `https://penelope.myshop.com`). When set, Step 5's "Push to instance" button becomes active. |
| `PENELOPE_INSTALL_SECRET` | optional | Bearer token sent with the forwarded install request. Generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_ANALYTICS_ID` | optional | Plausible / GA4 measurement ID. |
| `NEXT_PUBLIC_APP_URL` | optional | Canonical URL for OG tags (default: Vercel deployment URL). |

### Preview deployments

Every push to a branch creates a Vercel preview URL. The wizard and download flow work fully in preview mode without any env vars.

---

## Wizard steps

| # | Step | Key actions |
|---|---|---|
| 1 | Business basics | Name, owner, location, contact details |
| 2 | Vertical | Pick your industry; see sample automation procedures |
| 3 | Channel connect | Telegram bot token (required); Facebook, SMS, Stripe, Square, email optional |
| 4 | Hours & preferences | Response hours, timezone, tone, automation toggles |
| 5 | Review & deploy | Download `tenant.zip` **or** push to a live instance via `/api/install` |

---

## Deploying the downloaded zip

After Step 5 downloads `penelope-tenant-<id>.zip`:

```bash
# Unzip alongside your Penelope install directory
unzip penelope-tenant-<id>.zip -d ./my-penelope

cd my-penelope

# Review the generated config
cat tenant.json
cat .env

# Copy your Telegram bot token into .env if you didn't enter it in the wizard
# TELEGRAM_BOT_TOKEN=your_token_here

# Start Penelope
penelope up
# or: npx @penelope/cli up
```

---

## API route

`POST /api/install` accepts a `TenantConfig` JSON body and either:

- **Forwards** it to `PENELOPE_INSTANCE_URL/api/tenants` (when the env var is set), or
- **Returns a stub 201** with `{ stub: true }` — safe for testing.

`GET /api/install` returns a health probe.

---

## Package structure

```
packages/onboarding-web/
├── app/
│   ├── api/install/route.ts   ← install endpoint
│   ├── components/            ← LogoWordmark, ProgressDots, StepNav, VerticalCard, ChannelCard
│   ├── wizard/                ← Step1–5, WizardContext, data, types
│   ├── setup/                 ← /setup route (wizard shell)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               ← marketing landing
├── brand/                     ← symlinked brand assets (palette, typography)
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

---

## Design system

The UI uses the Penelope brand system:

- **Display type:** Cormorant Garamond 300 (serif, editorial weight)
- **UI type:** IBM Plex Sans (clean, legible)
- **Code/terminal:** JetBrains Mono
- **Primary:** `#2D4A3E` deep olive (loom)
- **Accent:** `#C9983F` warm gold (thread)
- **CTA:** `#A0522D` copper (shuttle)
- **Surfaces:** `#FDFCFA` bone-white / `#F6F3EC` bone

Semantic CSS tokens live in `app/globals.css`; Tailwind color scales in `tailwind.config.ts` (`loom-*`, `thread-*`, `shuttle-*`, `bone-*`).

---

## Contributing

This package lives at `packages/onboarding-web` inside the Penelope monorepo. It does not share a build pipeline with other packages — it is a standalone Next.js app.

TypeScript errors: `npm run type-check`  
Lint: `npm run lint`  
Build: `npm run build`
