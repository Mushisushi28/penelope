# @penelope/adapters

Reusable channel adapters for Penelope tenants. Each adapter implements the `ChannelAdapter` interface — a standard contract for inbound polling and outbound delivery.

## Adapters

| Adapter | Class | Status | Inbound | Outbound |
|---------|-------|--------|---------|----------|
| `telegram` | `TelegramOwnerAdapter` | Working | Long-poll getUpdates | send / editInChat / reactInChat |
| `fb-page` | `FbPageAdapter` | Working | Poll conversations | send (24h window enforced) |
| `twilio-sms` | `TwilioSmsAdapter` | Working | Poll or webhook | send |
| `email` | `ImapSmtpAdapter` | Working | IMAP idle + poll | SMTP via nodemailer |
| `instagram` | `InstagramAdapter` | Stub | TODO (needs App Review) | TODO |
| `loom-a2a` | `LoomA2aAdapter` | Working | Poll bus SQLite | Write to bus |
| `whatsapp-business` | `WhatsappBusinessAdapter` | Working | Webhook (+ poll-mode stub) | text / template / reaction |

## Installation

```bash
npm install @penelope/adapters
```

Peer dependency: `@penelope/core` (optional).

## Quick start with the registry

```ts
import { AdapterRegistry } from '@penelope/adapters';

const registry = new AdapterRegistry('my-tenant', {
  telegram: {
    enabled: true,
    bot_token: process.env.TELEGRAM_BOT_TOKEN!,
    chat_id_allowlist: ['YOUR_TELEGRAM_CHAT_ID'],
    offset_state_path: '/var/penelope/telegram-offset.json',
  },
  'fb-page': {
    enabled: true,
    page_id: '12345',
    page_token: process.env.FB_PAGE_TOKEN!,
    window_mode: 'enforce',
  },
  'twilio-sms': {
    enabled: true,
    account_sid: process.env.TWILIO_ACCOUNT_SID!,
    auth_token: process.env.TWILIO_AUTH_TOKEN!,
    from_number: '+15005550006',
  },
  email: {
    enabled: true,
    imap_host: 'imap.gmail.com',
    smtp_host: 'smtp.gmail.com',
    username: 'hello@acme.com',
    password: process.env.EMAIL_APP_PASSWORD!,
  },
});

const adapters = registry.build();

for (const adapter of adapters) {
  await adapter.start(async (msg) => {
    // msg is a normalised InboundMessage — route to your AI / workflow engine
    console.log(`[${msg.channel}] ${msg.external_user_id}: ${msg.text}`);
  });
}
```

## Manual adapter usage

```ts
import { TelegramOwnerAdapter, WindowExpiredError } from '@penelope/adapters';

const tg = new TelegramOwnerAdapter({
  tenant_id: 'acme',
  botToken: 'bot123:abc...',
  chatIdAllowlist: ['YOUR_TELEGRAM_CHAT_ID'],
});

await tg.start(async (msg) => {
  console.log(msg.text);
  // reply
  await tg.send({
    tenant_id: 'acme',
    channel: 'telegram',
    external_thread_id: msg.external_thread_id,
    text: 'Got it!',
  });
});
```

## FB Page 24-hour window

The `FbPageAdapter` tracks the last inbound message time per PSID and enforces the Messenger 24h reply window by default.

```ts
import { FbPageAdapter, WindowExpiredError } from '@penelope/adapters';

const fb = new FbPageAdapter({
  tenant_id: 'my-tenant',
  page_id: 'me',
  page_token: process.env.FB_PAGE_TOKEN!,
  window_mode: 'enforce', // 'warn' or 'off' also available
});

try {
  await fb.send({ ..., external_thread_id: customerPsid, text: 'Hi!' });
} catch (err) {
  if (err instanceof WindowExpiredError) {
    // Window expired — use HUMAN_AGENT tag or Marketing Messages API instead
  }
}
```

## Twilio SMS webhook mode

```ts
import express from 'express';
import { TwilioSmsAdapter } from '@penelope/adapters';

const sms = new TwilioSmsAdapter({
  tenant_id: 'acme',
  accountSid: process.env.TWILIO_SID!,
  authToken: process.env.TWILIO_TOKEN!,
  fromNumber: '+15005550006',
  mode: 'webhook',
});

await sms.start(async (msg) => { /* handle inbound */ });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.post('/webhooks/sms', sms.webhookHandler());
// TODO: add Twilio signature validation middleware before webhookHandler()
```

## WhatsApp Business (Cloud API)

Configure in 3 commands:

```bash
penelope tenant <slug> secret set WHATSAPP_TOKEN <permanent_token>
penelope tenant <slug> secret set WHATSAPP_PHONE_NUMBER_ID <id>
penelope tenant <slug> channels enable whatsapp-business
```

Then in your tenant config:

```ts
import { AdapterRegistry } from '@penelope/adapters';

const registry = new AdapterRegistry('my-tenant', {
  'whatsapp-business': {
    enabled: true,
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    business_account_id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
    permanent_access_token: process.env.WHATSAPP_TOKEN!,
    window_mode: 'enforce', // throws WindowExpiredError outside 24h; use a template instead
    webhook_secret: process.env.WHATSAPP_WEBHOOK_SECRET,
  },
});
```

Mount the webhook handler in Express:

```ts
import express from 'express';
import { WhatsappBusinessAdapter } from '@penelope/adapters';

const wa = new WhatsappBusinessAdapter({ ... });
await wa.start(async (msg) => { /* route inbound */ });

const app = express();
app.use(express.json());
// Raw body needed for HMAC verification
app.use((req, _res, next) => { req.rawBody = JSON.stringify(req.body); next(); });
app.use('/webhooks/whatsapp', wa.createWebhookHandler('my-hub-verify-token'));
```

### 24-hour window & templates

WhatsApp only allows free-form text replies within 24 hours of the last customer message.
Outside that window, pass a `template` in `OutboundMessage.meta`:

```ts
import { WhatsappBusinessAdapter, WindowExpiredError } from '@penelope/adapters';

try {
  await wa.send({ ..., external_thread_id: customerWaId, text: 'Hi!' });
} catch (err) {
  if (err instanceof WindowExpiredError) {
    // Window expired — use an approved template
    await wa.send({
      ...,
      external_thread_id: customerWaId,
      text: '',
      meta: {
        template: {
          name: 'appointment_reminder',
          language: 'en_US',
          components: [{ type: 'body', parameters: [{ type: 'text', text: 'John' }] }],
        },
      },
    });
  }
}
```

## Adding a new adapter

1. Create `src/my-channel.ts` exporting `MyChannelAdapter implements ChannelAdapter`.
2. Add options interface `MyChannelAdapterOptions`.
3. Export from `src/index.ts`.
4. Add a config shape to `src/registry.ts` and a `buildMyChannel()` method.
5. Write tests in `src/__tests__/my-channel.test.ts`.

The only contract is the `ChannelAdapter` interface in `src/types.ts`:
- `start(onInbound)` — begin delivering `InboundMessage`s.
- `stop()` — clean shutdown (idempotent).
- `send(out)` — deliver `OutboundMessage`, return `{ external_id }`.
- `edit?` and `react?` — optional, implement when the channel supports them.
