# @penelope/telemetry

Privacy-respecting usage metering for Penelope tenants.

## Privacy stance

**Default: OFF.** No data leaves your machine unless you explicitly set
`telemetry: true` in `tenant.json`. Even then, only aggregate counts are
transmitted — never customer names, message content, phone numbers, or
any personally identifiable information.

## Exact outbound payload

When opt-in is enabled the following JSON object is sent once per day to
`https://telemetry.penelope.dev/v1/ping`:

```json
{
  "install_id_hash": "abc123def456789a",
  "version": "0.1.0",
  "vertical": "auto-detailing",
  "channels_count": 2,
  "uptime_h": 8.5,
  "messages_handled_24h": 42,
  "schema": 1
}
```

Field-by-field:

| Field | What it is | What it is NOT |
|---|---|---|
| `install_id_hash` | `sha256(tenantId + salt)[0:16]` — not reversible | Your business name or slug |
| `version` | Package version string | |
| `vertical` | Business type from `tenant.json` (e.g. `"auto-detailing"`) | Your business name |
| `channels_count` | Integer count of active channels | Which channels or who uses them |
| `uptime_h` | Hours the agent was running in the window | When specifically |
| `messages_handled_24h` | Count of handled messages | Any message content |
| `schema` | Payload version number for server-side parsing | |

You can verify this by reading `src/anonymize.ts` and `src/opt-in.ts`.
The `assertNoPii()` guard runs before every send.

## Opt-in

```json
// tenant.json
{
  "telemetry": true,
  "vertical": "auto-detailing"
}
```

On first ping a notice is printed to the console showing the exact payload.
A flag file is written to `tenants/<id>/state/telemetry-consent-shown.flag`
so the notice only shows once.

## Storage

Counters persist to `tenants/<id>/state/telemetry.sqlite` using better-sqlite3.
All reads and writes are local-only.

## Architecture

- `src/meter.ts` — per-tenant counter with SQLite backend
- `src/middleware.ts` — bus-event subscriber that increments counters
- `src/anonymize.ts` — PII guard before any outbound payload
- `src/api.ts` — read-side for the dashboard home panel
- `src/opt-in.ts` — optional aggregate ping (default OFF)

## Usage

```ts
import { TenantMeter, TelemetryMiddleware, getTenantMetrics } from "@penelope/telemetry";

// Wire up meter on startup
const meter = new TenantMeter("acme-auto", "./tenants/acme-auto/state");
meter.startSession();

// Wire up event subscriber against your bus
const middleware = new TelemetryMiddleware(meter);
bus.on("*", (event) => middleware.handle(event));

// Read metrics for the dashboard
const snap = getTenantMetrics("acme-auto", "./tenants");
console.log(snap.messages_handled, "messages in last 24h");
```
