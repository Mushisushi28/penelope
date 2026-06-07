# @penelope/cli

> She runs the home while Odysseus is away.

Penelope CLI — scaffold and run your small business AI agent in 90 seconds.

## Install

```bash
# Global install
npm install -g penelope

# Or run directly with npx
npx penelope init
```

## Commands

### `penelope init`

Interactive 5-question scaffold. Creates `tenants/<slug>/` with config, env stub, and procedure templates.

```
? Business name? Sample Mobile Service
? Tenant slug: sample-mobile-service — looks good? Yes
? Business vertical? Auto Service
? Channels to enable? telegram-owner, fb-page
? Quiet hours start (24h): 22:00
? Quiet hours end (24h): 07:00
? Daily brief time (24h): 08:00
? Telegram bot token (leave blank to do later):
```

### `penelope up [slug]`

Start the tenant's agents (Telegram bot, channel watchers).

```bash
penelope up
penelope up my-business --dry-run
```

### `penelope status [slug]`

Show agent status, last inbound message, and queue depth per channel.

```bash
penelope status
penelope status my-business --json
```

### `penelope tenant`

Manage tenants.

```bash
penelope tenant list
penelope tenant info my-business
penelope tenant remove my-business
```

### `penelope send <channel> <recipient> <text>`

Send a message directly via a channel (admin / testing).

```bash
penelope send telegram-owner 1234567890 "Test message"
penelope send twilio-sms +14035551234 "Hello from Penelope" --slug my-business
```

### `penelope doctor [slug]`

Check Node version, env vars, tenant config validity, and bot connectivity.

```bash
penelope doctor
penelope doctor my-business
```

## Tenant directory layout

```
tenants/
  <slug>/
    tenant.json        ← business config
    .env.example       ← fill in secrets → rename to .env
    procedures/        ← conversation YAML scripts
    agents/            ← per-agent persona files
    state/             ← runtime SQLite DB + logs
    dashboard/         ← Odysseus dashboard assets
```

## Supported channels

| Key | Description |
|---|---|
| `telegram-owner` | Owner Telegram bot (required) |
| `fb-page` | Facebook Page Messenger |
| `twilio-sms` | SMS via Twilio |
| `imap-smtp` | Email inbox/outbox |
| `instagram` | Instagram DMs |

## Supported verticals

`auto-service`, `home-services`, `personal-services`, `food-service`, `retail`, `generic`

## Development

```bash
cd packages/cli
npm install
npm run build
npm test

# Smoke test
./bin/penelope.mjs --help
```

## License

MIT
