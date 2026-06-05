# Quickstart

Get a small business running on Penelope in about ten minutes.

## Prerequisites

- Node.js 20 or newer
- A free Telegram account (so you can talk to your bot)
- A Telegram bot token from [@BotFather](https://t.me/BotFather) — message "/newbot", pick a name, copy the token it gives you
- *(optional, for customer-facing channels)* a Facebook Page access token, a Twilio account, or SMTP credentials

## Step 1 — Install

```bash
npx penelope init
```

You will be asked five questions:

1. **What is your business called?** — display name, slug auto-derived
2. **What vertical?** — auto-service, home-services, personal-services, food-service, retail, generic
3. **Which channels do you want to connect?** — telegram-owner is required, others are optional
4. **What are your hours? When do you want the morning brief?** — defaults shown
5. **Paste the Telegram bot token you got from BotFather** — you can skip and add it later

When you finish, Penelope writes `tenants/<your-slug>/` with a starter `tenant.json`, sample procedures pulled from the matching vertical template, and an empty agents directory.

## Step 2 — Start

```bash
penelope up
```

This boots the owner bot and any customer-facing watchers you enabled. The owner bot will message you on Telegram with a one-line "I'm awake" confirmation. From that moment on, you can talk to your business in chat.

## Step 3 — Try it

In Telegram, send your bot:

- `what's today look like` — daily brief
- `draft a quote for a 2018 silverado pair heavy oxidation` — quote builder runs
- `status` — what's running, queue depth, last inbound
- `pause autopilot for the day` — flips the autopilot flag

## Step 4 — Connect a customer channel

If you skipped channels in step 1, add one:

```bash
penelope tenant <your-slug>  # opens an editor on tenant.json
```

Add a `channel` entry, set credentials in `tenants/<your-slug>/.secrets/`, then run `penelope up` again.

## Where things live

```
tenants/
  <your-slug>/
    tenant.json         <- business config
    procedures/         <- YAML procedures (qualifying, quoting, booking, review)
    agents/             <- owner-agent + customer-agent + specialists
    state/              <- runtime DB (don't edit by hand)
    audit/              <- append-only outbound log (compliance)
    .secrets/           <- channel credentials (gitignored)
    dashboard/          <- per-tenant Odysseus dashboard
```

## Next steps

- Customize the procedures under `tenants/<slug>/procedures/` to match how you actually quote / book / follow up
- Open `http://localhost:18900` for the per-tenant dashboard (shadow queue, daily brief, inbox, settings)
- Browse community connectors / procedure templates: `penelope marketplace list`
- Add more channels — see `INSTALL.md` for each provider's token + setup notes
