# @penelope/core

Core tenant model and procedure YAML loader for [Penelope](https://github.com/Mushisushi28/penelope).

## What this is

`@penelope/core` provides two things:

1. **Tenant model** — TypeScript types and Zod validation schemas for `tenant.json`, the per-business config file that describes a business's channels, pricing rules, hours, and approval gates.

2. **Procedure YAML loader** — reads and validates procedure `.yaml` files that define state machines for specialist agents (e.g. "when a customer DMs the Facebook page, run this sequence of ask/quote/book steps").

## Install

```bash
npm install @penelope/core js-yaml zod
```

## Usage

### Load and validate a tenant config

```typescript
import { validateTenantConfig } from '@penelope/core/tenant';
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('tenants/my-shop/tenant.json', 'utf-8'));
const config = validateTenantConfig(raw); // throws ZodError if invalid
console.log(config.tenant_id, config.vertical);
```

### Scaffold a new tenant directory tree

```typescript
import { validateTenantConfig, scaffoldTenant } from '@penelope/core/tenant';

const config = validateTenantConfig({ /* ... */ });
const result = scaffoldTenant(config, '/path/to/tenants/');
// Creates: tenants/my-shop/{tenant.json, procedures/, agents/, audit/, state/, ...}
console.log(result.created); // list of newly created paths
```

### Load a procedure YAML

```typescript
import { loadProcedure, ProcedureLoadError } from '@penelope/core/procedures';

try {
  const proc = loadProcedure('tenants/my-shop/procedures/customer-inbound-fb.yaml');
  console.log(proc.procedure_id);    // "auto-service-fb-inbound"
  console.log(proc.states.length);   // number of states in the state machine
} catch (err) {
  if (err instanceof ProcedureLoadError) {
    console.error(err.message); // human-readable error with field paths
  }
}
```

### Safe (non-throwing) variant

```typescript
import { loadProcedureSafe } from '@penelope/core/procedures';

const result = loadProcedureSafe('procedures/customer-inbound-fb.yaml');
if (result.ok) {
  const { procedure } = result;
  // use procedure
} else {
  console.error(result.error.message);
}
```

### Parse YAML from a string (useful in tests)

```typescript
import { parseProcedureYaml } from '@penelope/core/procedures';

const proc = parseProcedureYaml(`
schema_version: 1
procedure_id: my-proc
owner_team: ops
specialist_class: my-specialist
trigger:
  kind: manual
inputs:
  required:
    - thread_id
states:
  - id: greet
    actions:
      - kind: send_message
        template: "Hello!"
`);
```

## Tenant config schema highlights

- `schema_version: 1` (literal) — forward compat guard
- `tenant_id` — slug-safe `[a-z0-9_-]`
- `vertical` — one of `auto-service | home-services | personal-services | food-beverage | retail | professional | fitness | custom`
- `channels` — array of `{ type, enabled, credential_env }` — at least one required
- `pricing` — array of rules with `floor`, `ceiling`, `auto_quote_band` (auto_quote_band must be within floor..ceiling)
- `hours.timezone` — IANA timezone required
- `brand.brand_color` — must be `#RRGGBB` hex

## Procedure YAML schema highlights

- `schema_version: 1` (literal)
- `procedure_id` — slug-safe
- `trigger.kind` — one of `inbound_message | bus_event | schedule | payment_received | job_status_change | manual`
- `states` — array of named states, each with `id` (slug), `actions` (array of steps), optional `next`, `when`, `approval`
- `actions[].kind` — must be one of 14 recognized step kinds; unknown kinds fail validation
- `runtime_budget` — optional; controls max tokens/USD/runs per day

## Step kinds

| kind | description |
|------|-------------|
| `send_message` | Send a reply on a channel |
| `ask_question` | Ask customer a qualifying question |
| `compute_quote` | Run pricing engine against a rule |
| `lookup_external` | Call an external API (Amazon, Google, etc.) |
| `set_state` | Update thread/customer state key |
| `schedule_followup` | Defer an action to a later time (ISO 8601 duration) |
| `emit_bus_event` | Emit event on the Loom bus |
| `escalate` | Hand off to a higher-level agent and halt |
| `wait_for_event` | Pause until a bus event arrives |
| `offer_booking_link` | Send Calendly/gCal booking link |
| `mark_job_status` | Update job status in CRM |
| `send_review_request` | Fire review-ask SMS/email |
| `send_invoice` | Send payment link |
| `log_audit` | Write to tenant audit log |

## Testing

```bash
npm test
```

8 tests covering: valid load, valid full procedure, missing field, malformed YAML, unknown step kind, file not found, safe variant, inline parse.
