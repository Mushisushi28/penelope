# @penelope/connector-discovery

Self-adding connector discovery pipeline for [Penelope](https://github.com/Mushisushi28/penelope).

Given a service name like `"Toast POS"` or `"Vagaro"`, the agent automatically
finds the best available integration using a five-tier cascade.

## Cascade

```
service name
    │
    ▼
 Tier 1 ── MCP registry search
    │       (npm @modelcontextprotocol, Glama.ai, MCPHub.com)
    │ miss
    ▼
 Tier 2 ── API-skill check
    │       (@penelope/adapters, @penelope/connectors*)
    │ miss
    ▼
 Tier 3 ── OpenAPI spec search
    │       (URL probing, GitHub code search, hermes registration*)
    │ miss
    ▼
 Tier 4 ── Browser recipe builder                ← ALWAYS runs if 1-3 miss
    │       (open-claude-in-chrome MCP, DOM observation, YAML recipe)
    │ error
    ▼
 Tier 5 ── Computer-use fallback                 ← last resort
            (Anthropic computer-use beta, action recording)
```

Every internet-reachable service gets at least Tier 4 (browser recipe).
The pipeline **never returns "no integration possible"** unless the service
has no internet presence.

_* Placeholder until `v0.2/connector-tiers` is merged._

## Usage

### CLI

```bash
# Quickest form
penelope connector discover "Toast POS"

# With options
penelope connector discover "Vagaro" \
  --email owner@vagaro.com \
  --capabilities "login,list-items,send-message" \
  --output-dir ./connectors \
  --verbose
```

### Programmatic

```ts
import { discoverConnector } from "@penelope/connector-discovery";

const result = await discoverConnector({
  service: "Toast POS",
  capabilities: ["login", "list-items", "create-item"],
  owner_email: "owner@myrestaurant.com",
});

console.log(result.tier);            // 1-5
console.log(result.confidence);      // 0-1
console.log(result.connector_spec);  // McpConnectorSpec | ApiSkillConnectorSpec | …
```

### Skip specific tiers (e.g. start from OpenAPI)

```ts
const result = await discoverConnector(req, {
  // skipTiers: [1, 2] starts the cascade at OpenAPI
});
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OPEN_CLAUDE_MCP_URL` | stdio | URL of a running open-claude-in-chrome MCP server |
| `ANTHROPIC_API_KEY` | — | Required for tier-5 computer-use |
| `PENELOPE_OWNER_EMAIL` | — | Fallback owner email for evidence trail |
| `PENELOPE_ADAPTERS_PATH` | auto | Comma-separated paths to scan for api-skills |

## Opportunistic upgrade (promote)

When a tier-4 browser recipe has run reliably for 10+ days and a better
integration becomes available, `checkPromoteEligibility()` returns a
`PromoteCandidate` suggestion.  Promotion is advisory — it requires explicit
owner approval.

```ts
import { checkPromoteEligibility, InMemoryReliabilityStore } from "@penelope/connector-discovery/promote";

const store = new InMemoryReliabilityStore();
const candidate = await checkPromoteEligibility("Toast POS", store);
if (candidate) {
  // email/Telegram the owner with formatPromoteSuggestion(candidate)
}
```

## Adding a new discovery source

1. Create `src/find-<source>.ts` exporting `async function find<Source>(req: DiscoveryRequest): Promise<DiscoveryResult | null>`.
2. Add it to the cascade in `src/cascade.ts` at the appropriate tier position.
3. Add tests in `src/__tests__/<source>.test.ts`.
4. Update this README.

## Integration with @penelope/connectors

This package imports `@penelope/connectors` as an optional peer dependency
(branch `v0.2/connector-tiers`).  Until that branch merges:

- Tier-2 (`find-api-skill`) logs a placeholder evidence entry and returns `null`.
- All other tiers work fully.

Set `PENELOPE_ADAPTERS_PATH` to a local directory of skill `.ts` files to test
tier-2 without the full connectors package.
