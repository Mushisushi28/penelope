# @penelope/hermes

Self-extending API connector system for Penelope. Discovers connectors from OpenAPI specs, stores them as JSON, and executes authenticated HTTP calls at runtime with per-tenant credentials.

## Bundled connectors

| Connector | Operations | Auth |
|-----------|-----------|------|
| `stripe` | 587 | Bearer token (`STRIPE_API_KEY`) |
| `calendly` | 56 | Bearer token (`CALENDLY_API_KEY`) |
| `twilio-messaging` | 58 | Basic auth (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`) |

## Quick start

```ts
import { getDefaultRegistry, invoke, findOp } from '@penelope/hermes';
import type { TenantCredentials } from '@penelope/hermes';

const registry = getDefaultRegistry();
const stripe = registry.get('stripe')!;
const op = findOp(stripe, 'GetCustomers');

const creds: TenantCredentials = { STRIPE_API_KEY: process.env.STRIPE_API_KEY! };
const result = await invoke(stripe, op, { limit: '10' }, creds);
console.log(result.data);
```

## Stripe helpers

```ts
import { getDefaultRegistry } from '@penelope/hermes';
import { createCheckoutSession, listPayments, refund } from '@penelope/hermes/stripe';

const stripe = getDefaultRegistry().get('stripe')!;
const creds = { STRIPE_API_KEY: 'sk_live_...' };

// Create a checkout session
const session = await createCheckoutSession(stripe, creds, {
  items: [{ price: 'price_abc', quantity: 1 }],
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});

// List recent payments
const payments = await listPayments(stripe, creds, undefined, 20);

// Refund
const refunded = await refund(stripe, creds, 'pi_abc123');
```

## Per-tenant secrets

Credentials are passed at call time, never stored in connector JSON:

```ts
// tenants/<id>/.secrets/stripe.json  (gitignored)
// { "STRIPE_API_KEY": "sk_live_..." }
import { loadStripeCredentials } from '@penelope/hermes/stripe';
const creds = loadStripeCredentials('./tenants/acme/.secrets/stripe.json');
```

## CLI

```sh
# Discover a new connector
node dist/cli.js add-connector https://api.example.com/openapi.json --name MyAPI

# List registered connectors
node dist/cli.js list

# Dry-run an operation (prints resolved HTTP request)
node dist/cli.js invoke stripe GetCustomers --arg limit=10 --secret STRIPE_API_KEY=sk_test_...
```

## Regenerate bundled connectors

```sh
node scripts/generate-connectors.mjs
```
