# Deploying Penelope

Get a tenant running from a clean machine in about ten minutes.

## Prerequisites

- **Node.js 22** (required — `@penelope/memory` uses Node 22's native sqlite)
- **git**
- **sqlite3** CLI (optional, useful for inspecting the bus DB)
- **ffmpeg** (optional — only needed if you enable voice memo transcription)

Check your Node version: `node --version`. Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to switch if needed.

## 1. Clone and install

```bash
git clone https://github.com/Mushisushi28/penelope.git
cd penelope
npm install
```

## 2. Copy the env file

```bash
cp .env.example .env
```

Open `.env`. Most values have sensible defaults. The only required field to get started is `TELEGRAM_BOT_TOKEN`.

## 3. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Pick a name and username for your bot
4. Copy the token BotFather gives you
5. Paste it into `.env` as `TELEGRAM_BOT_TOKEN=<your token>`

## 4. Create your first tenant

Copy the reference tenant and edit it:

```bash
cp -r tenants/dhr tenants/<your-slug>
```

Edit `tenants/<your-slug>/tenant.json`:
- Set `tenant_id` to your slug
- Set `name`, `vertical`, and `brand` fields
- Adjust `pricing` if your vertical uses it

Supported verticals: `auto-service`, `home-services`, `personal-services`, `food-service`, `retail`, `generic`.

## 5. Set tenant secrets

```bash
cp .env.example tenants/<your-slug>/secrets.env
```

Fill in any channel credentials your tenant needs (FB Page token, Twilio SID/auth, etc.). The core stack only requires the Telegram bot token from step 3.

## 6. Start

```bash
npm run start --workspace @penelope/cli
```

Or via the binary directly:

```bash
node packages/cli/bin/penelope.mjs up
```

Penelope will boot, connect to Telegram, and send your bot an "I'm awake" message.

## 7. Verify

- **Telegram** — message your bot `status`. You should get a brief back.
- **Dashboard** — open `http://localhost:18900` in a browser. Pick your tenant from the dropdown.
- **Logs** — tail `tenants/<your-slug>/audit.jsonl` to see the tamper-chained audit stream.

## Troubleshooting

**Bot doesn't respond** — check `TELEGRAM_BOT_TOKEN` matches BotFather exactly; whitespace breaks it.

**`node:sqlite` module error** — you're on Node < 22; upgrade and retry.

**Port 18900 in use** — set `DASHBOARD_PORT=<other>` in `.env` and restart.

## Docker (optional)

```bash
docker compose up -d
```

Mounts `tenants/` as a volume so tenant data persists. Set env vars in `.env` at project root — compose picks it up.
