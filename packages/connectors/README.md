# @penelope/connectors

Five-tier connector architecture for Penelope. Every service a small business
needs is reachable via the best available integration path, from rich MCP
servers down to full computer-use as a last resort.

## Tier Hierarchy

| Tier | Name | When to use | Cost |
|------|------|-------------|------|
| 1 | **mcp** | Service ships an MCP server (stdio or SSE) | Lowest |
| 2 | **api-skill** | Hand-coded TypeScript wrapper — used when a tight, opinionated client is worth writing | Low |
| 3 | **hermes-openapi** | Service has an OpenAPI spec — `@penelope/hermes` auto-generates all operations | Low–Medium |
| 4 | **browser** | Service has a web UI but no/insufficient API — `open-claude-in-chrome` MCP drives Chrome | Medium |
| 5 | **computer-use** | Legacy desktop app or ancient ERP with no web layer — Anthropic computer-use beta | Highest |

**Auto-promote**: The `evaluatePromotions()` engine monitors usage and suggests
tier upgrades when a better path becomes available. All promotions require owner
approval before taking effect.

## Usage

```ts
import { seedConnectors, register, get, byCategory, byTier } from "@penelope/connectors";

// Seed the v0.2 catalog (80+ connectors)
seedConnectors();

// Discover
const paymentConnectors = byCategory("payments");
const mcpConnectors = byTier("mcp");

// Use a live connector
const stripe = get("stripe");
if (stripe) {
  await stripe.init(tenantConfig, secretRef);
  const result = await stripe.invoke("create-record", { amount: 2000, currency: "usd" });
}
```

## Configured Stripe in 3 Commands

```bash
# 1. Store your Stripe secret key in the tenant's secret store
penelope tenant <slug> secret set STRIPE_SECRET_KEY sk_test_...

# 2. Enable the stripe-mcp connector for the tenant
penelope tenant <slug> connectors enable stripe-mcp

# 3. Verify the connection (lists first 10 customers via MCP)
penelope tenant <slug> connectors test stripe-mcp list_customers
```

The connector spawns `npx @stripe/mcp --tools=all` as a child process on first
use. All 8 operations (`list_customers`, `create_customer`, `list_payments`,
`create_payment_link`, `list_subscriptions`, `create_subscription`,
`refund_payment`, `list_invoices`) are available immediately. If the MCP server
is unavailable, the `payment-reconciler` specialist falls back automatically to
`@penelope/billing`'s direct Stripe wrapper for `create_customer` and
`list_invoices`.

## Adding a New Connector

### Tier 1 — MCP

```ts
import { McpConnector } from "@penelope/connectors";

export class MyMcpConnector extends McpConnector {
  readonly id = "my-service";
  readonly displayName = "My Service";
  readonly description = "My service via MCP.";
  readonly category = "other" as const;
  readonly capabilities = ["list-records"] as const;

  protected resolveMcpConfig(tenant: TenantConfig) {
    return {
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "mcp-server-my-service"],
      env: { MY_SERVICE_API_KEY: tenant.settings?.apiKey as string },
    };
  }
}
```

### Tier 2 — API Skill

```ts
import { ApiSkillConnector } from "@penelope/connectors";

export class MyApiSkill extends ApiSkillConnector {
  readonly id = "my-service";
  // ... required fields ...

  protected async onInit(tenant: TenantConfig) {
    // set up HTTP client
  }

  async invoke(op: string, args: unknown): Promise<unknown> {
    switch (op) {
      case "list-records": return this.listRecords(args);
      default: throw new Error(`unsupported op: ${op}`);
    }
  }
}
```

### Tier 3 — Hermes OpenAPI

```ts
import { HermesConnector } from "@penelope/connectors";
import type { HermesOperation } from "@penelope/connectors";

const OPERATIONS: HermesOperation[] = [
  { operationId: "listCustomers", method: "GET", path: "/v1/customers", summary: "List customers" },
];

export class MyHermesConnector extends HermesConnector {
  readonly id = "my-service";
  // ... required fields ...
  readonly specConfig = {
    specUrl: "https://my-service.com/openapi.json",
    baseUrl: "https://api.my-service.com",
    securityScheme: "bearerAuth" as const,
  };

  protected getOperation(operationId: string): HermesOperation | undefined {
    return OPERATIONS.find((op) => op.operationId === operationId);
  }
}
```

### Tier 4 — Browser

```ts
import { BrowserConnector } from "@penelope/connectors";

export class YelpConnector extends BrowserConnector {
  readonly id = "yelp";
  // ... required fields ...

  protected defaultRecipes() {
    return {
      "review-ask": {
        name: "Request a Yelp review",
        steps: [
          { action: "navigate" as const, url: "https://biz.yelp.com/biz/{{bizId}}/review-solicitation" },
          { action: "find" as const, query: "Send review request button" },
          { action: "fill" as const, uid: "{{emailFieldUid}}", value: "{{customerEmail}}" },
          { action: "click" as const, uid: "{{submitUid}}" },
          { action: "wait" as const, text: "Request sent" },
        ],
      },
    };
  }
}
```

### Tier 5 — Computer Use

```ts
import { ComputerUseConnector } from "@penelope/connectors";

export class LegacyErpConnector extends ComputerUseConnector {
  readonly id = "legacy-erp";
  // ... required fields ...

  protected defaultGoals() {
    return {
      "create-invoice": {
        goalTemplate: "Open LegacyERP, navigate to Invoices, create a new invoice for customer {{customerName}} with total {{amount}}. Screenshot the saved invoice.",
        maxTurns: 15,
      },
    };
  }
}
```

## Connector Registration (in `seed-connectors.ts`)

```ts
stub({
  id: "my-service",
  displayName: "My Service",
  description: "...",
  tier: "hermes-openapi",
  category: "payments",
  capabilities: ["charge"],
  implementationStatus: "stub",
});
// Optionally register upgrade hints for auto-promote:
registerOpenApiSpec("my-service", "https://my-service.com/openapi.json");
```

## Auto-Promote

```ts
import { evaluatePromotions, all } from "@penelope/connectors";

const suggestions = evaluatePromotions(all(), usageSamples);
// suggestions is an array of PromotionSuggestion objects.
// Present them to the owner; they set approved=true to activate.
```

## Architecture

```
packages/connectors/
  src/
    types.ts            — Connector interface, Tier, Category, Capability
    registry.ts         — register/get/byCategory/byTier + JSON persistence
    tier-mcp.ts         — MCP adapter base (stdio + SSE)
    tier-api-skill.ts   — Hand-coded API skill base
    tier-hermes.ts      — OpenAPI auto-discovery bridge
    tier-browser.ts     — Browser automation via open-claude-in-chrome MCP
    tier-computer-use.ts — Anthropic computer-use beta
    auto-promote.ts     — Opportunistic tier upgrade suggestions
    seed-connectors.ts  — v0.2 catalog (80+ connector stubs)
    index.ts            — Public API
    __tests__/
      registry.test.ts
      tier-dispatch.test.ts
      seed.test.ts
      auto-promote.test.ts
  state/
    connectors.json     — Persisted registry (gitignored per-deployment)
```
