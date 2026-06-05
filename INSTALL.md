# Installing Penelope

Penelope turns a Telegram chat into a complete digital back-office for a small business. This guide walks a non-developer through getting it running on a fresh machine or VPS in under 15 minutes.

---

## System requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 5 GB | 20 GB |
| OS | Ubuntu 22.04 / macOS 13+ / Windows 11 | Ubuntu 22.04 LTS |
| Node.js | v20.0.0+ | v20 LTS |
| Docker | Optional | Recommended for VPS |

Check your Node version:
```
node --version   # must print v20.x.x or higher
```

If Node is missing: https://nodejs.org/en/download (choose the LTS installer for your OS).

---

## Option A — Docker (recommended for VPS or servers)

Docker isolates Penelope from your system and makes upgrades a one-command operation.

### 1. Install Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

macOS / Windows: https://docs.docker.com/get-docker/

### 2. Clone the repository

```bash
git clone https://github.com/Mushisushi28/penelope.git
cd penelope
```

### 3. Configure your environment

```bash
cp .env.example .env
nano .env   # or use any text editor
```

Fill in at minimum:
- `OWNER_TELEGRAM_BOT_TOKEN` — see [Getting a Telegram bot token](#getting-a-telegram-bot-token)
- `OWNER_TELEGRAM_CHAT_ID` — see [Finding your Telegram chat ID](#finding-your-telegram-chat-id)
- Any channel tokens for your business (Facebook, SMS, email — skip any you are not using yet)

### 4. Start Penelope

```bash
docker compose up -d
```

This pulls the image (first time takes 2-3 minutes), starts the core process and dashboard.

### 5. Verify

```bash
docker compose ps          # both services should show status: healthy
docker compose logs -f     # watch live logs; Ctrl+C to stop
```

Open your browser to `http://your-server-ip:18900` to see the dashboard.

Send `/status` to your Telegram bot. It should reply with a summary.

### Stopping and updating

```bash
docker compose down        # stop
docker compose pull        # pull latest image
docker compose up -d       # restart on new image
```

---

## Option B — npm (local machine or developer setup)

### 1. Install the CLI globally

```bash
npm install -g penelope
```

### 2. Initialise your first tenant

```bash
penelope init
```

This wizard asks you for your business name, Telegram token, and which channels you want to enable. It writes `./tenants/default/config.yaml` and a `.env` file.

### 3. Start Penelope

```bash
penelope up
```

The core process and dashboard both start. The dashboard is at `http://localhost:18900`.

### Running as a background service (Linux)

```bash
penelope install-service    # creates a systemd unit
sudo systemctl enable --now penelope
```

---

## Getting a Telegram bot token

1. Open Telegram and search for **@BotFather**.
2. Start a chat with BotFather and send `/newbot`.
3. BotFather asks for a name (e.g. "Acme Auto Replies") and a username ending in `bot` (e.g. `acme_auto_bot`).
4. BotFather replies with a token that looks like `7123456789:AAF...`. Copy it.
5. Paste it as the value of `OWNER_TELEGRAM_BOT_TOKEN` in your `.env`.

### Finding your Telegram chat ID

1. Search for **@userinfobot** in Telegram.
2. Start a chat and send any message.
3. It replies with `Id: 7949309437` (your numeric ID). Copy the number.
4. Paste it as `OWNER_TELEGRAM_CHAT_ID` in your `.env`.

---

## Getting a Facebook Page access token

1. Go to https://developers.facebook.com and create a free app (type: Business).
2. Add the **Messenger** product to your app.
3. In Messenger settings, generate a Page Access Token for your business Page.
4. Enable the required permissions: `pages_messaging`, `pages_read_engagement`.
5. Paste the token as `FB_PAGE_ACCESS_TOKEN` in your `.env`.

Full guide: https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start

---

## Verifying the install

Run the built-in diagnostics:

```bash
penelope doctor
```

This checks:
- Node version
- Required env vars present
- Telegram bot reachable
- Facebook webhook responding (if configured)
- Dashboard HTTP responding
- Database readable

A passing run prints `All checks passed.` Any failures print the fix command next to the error.

---

## First-run smoke test

1. Send a message to your Telegram bot (the one whose token you configured).
2. The bot should reply within 5 seconds with a greeting and a brief summary of open tasks.
3. Open `http://localhost:18900` (or your server IP). You should see the Odysseus-themed dashboard with your tenant name.
4. Send `/help` to the bot to see available commands.

---

## Troubleshooting

### "penelope: command not found" after `npm install -g penelope`

Your global npm bin directory is not in PATH. Run:
```bash
npm bin -g    # prints the directory
export PATH="$(npm bin -g):$PATH"   # add to ~/.bashrc or ~/.zshrc
```

### Docker: "port 18900 already in use"

Change the port in `.env`:
```
PENELOPE_DASHBOARD_PORT=18901
```
Then restart: `docker compose down && docker compose up -d`

### Telegram bot not responding

- Confirm `OWNER_TELEGRAM_BOT_TOKEN` is correct (no extra spaces).
- Check `docker compose logs penelope-core | grep telegram`.
- Make sure your server can reach `api.telegram.org` (no firewall block on port 443).

### Facebook webhook returns 403

- The `FB_VERIFY_TOKEN` in `.env` must exactly match the token you entered in Meta Developers → Webhooks → Edit.
- The webhook URL must be publicly reachable (not `localhost`). Use a tunnel for local dev:
  ```bash
  npx localtunnel --port 3000
  ```

### "better-sqlite3 was compiled against a different Node.js version"

The native module needs recompiling:
```bash
npm rebuild better-sqlite3
```
Or, inside Docker: `docker compose build --no-cache`.

### Dashboard shows no data

- Confirm `penelope-core` is healthy: `docker compose ps`.
- The dashboard reads `/data/state/tenants/<slug>/biz.sqlite`. Check the volume is mounted: `docker compose exec penelope-dashboard ls /data/state`.
