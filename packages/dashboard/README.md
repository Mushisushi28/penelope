# @penelope/dashboard

Per-tenant owner dashboard for Penelope. Odysseus-themed, vanilla JS, no bundler.

## Run

```sh
npm install
node serve.mjs
```

Open `http://localhost:18900`

## Env

| Variable | Default | Purpose |
|---|---|---|
| `PENELOPE_DASHBOARD_PORT` | `18900` | HTTP listen port |
| `PENELOPE_TENANT_BUS` | *(unset)* | Path to tenant SQLite bus db. Stubs active when unset. |
| `PENELOPE_TENANT_SLUG` | `owner` | Tenant label shown in topbar |

## Panels

| Panel | Status |
|---|---|
| Home | Live — stats, brief, approvals callout, quick actions |
| Shadow Queue | Live — approve / decline / edit drafted messages |
| Inbox | Live — unified thread list, per-thread message view |
| Settings | Live — appearance, business info, agent voice, escalation, security |
| Customers / Quotes / Money / Agents / Procedures / Connectors | Stub (soon) |

## Design

Deep olive + warm copper palette. Odysseus-inspired CSS variable tokens:
- `--penelope-loom` — background
- `--penelope-thread` — text
- `--penelope-shuttle` — accent (copper)
- `--penelope-warp` — borders
- `--penelope-weft` — raised surfaces

Theme, density, and color customization saved to `localStorage['penelope-theme']`.
