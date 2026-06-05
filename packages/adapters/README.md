# @penelope/adapters

Channel adapters for Penelope: Telegram, Facebook Page Messenger, Twilio SMS, SMTP email, Instagram DM, and the loom-a2a internal bus.

---

## telegram-owner — Penelope exclusive

The `TelegramOwnerAdapter` (`src/telegram-owner.ts`) is the sole Telegram channel between
the owner and the system. **It is reserved for Penelope (head agent) only.**

### The rule

```
USER  ←─────── telegram-owner ───────→  PENELOPE  (head agent)
                                              │
          ┌──────┬──────┬──────────┬──────────┼──────┬──────────┐
          ▼      ▼      ▼          ▼           ▼      ▼          ▼
      customer booking quoting  payments   reviews marketing daily-brief
      (bus only — never touch telegram-owner)
```

Specialists receive work from Penelope via the loom-a2a bus and publish results back to the
bus. Penelope subscribes to those results and decides what (if anything) the owner sees.

### Enforcement

`TelegramOwnerAdapter` checks `agent_role` at construction time:

```typescript
new TelegramOwnerAdapter({ agent_role: 'penelope', ... });   // OK
new TelegramOwnerAdapter({ agent_role: 'booking', ... });    // throws
```

This is a startup-time check, not a runtime message-time check, so misconfiguration is caught
before the agent begins processing.

### Specialist agents

Specialists extend `SpecialistAgent` from `@penelope/agents`. The base class exposes
`acquireTelegramOwnerAdapter()` which throws unconditionally — it exists solely to document
and enforce the constraint at the type level.

---

## Other adapters

| Adapter | File | Who uses it |
|---|---|---|
| `telegram-owner` | `src/telegram-owner.ts` | Penelope only |
| `fb-page` | `src/fb-page.ts` | customer-frontend specialist |
| `twilio-sms` | `src/twilio-sms.ts` | customer-frontend specialist |
| `sms-textnow` | `src/sms-textnow.ts` | customer-frontend specialist |
| `imap-smtp` | `src/imap-smtp.ts` | customer-frontend specialist |
| `instagram-dm` | `src/instagram-dm.ts` | customer-frontend specialist (stub) |
| `loom-a2a` | `src/loom-a2a.ts` | All agents (internal bus) |

---

## Implementing a new adapter

1. Create `src/your-channel.ts`.
2. Implement the `ChannelAdapter` interface from `src/types.ts`.
3. Register in `src/index.ts`.
4. Add required env vars to `.env.example` with comments.
5. If the adapter is customer-facing, wire it to the customer-frontend specialist only.
   Never wire a customer-facing adapter directly to Penelope.
