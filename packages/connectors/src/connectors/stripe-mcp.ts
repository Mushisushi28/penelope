/**
 * @penelope/connectors — Tier 1: Stripe MCP connector
 *
 * Spawns `npx @stripe/mcp --tools=all --api-key=<key>` as a child process
 * and wraps it via McpConnector's stdio transport.
 *
 * Secret loading:
 *   The tenant's STRIPE_SECRET_KEY is resolved at init time via
 *   @penelope/secrets.  The key must be stored with the logical name
 *   "STRIPE_SECRET_KEY" under the tenant slug.
 *
 * Fallback:
 *   If the MCP server is unavailable, @penelope/billing's direct Stripe
 *   wrapper (stripe-client.ts) is available as a tier-3 Hermes fallback.
 *   The payment-reconciler specialist checks for this connector first,
 *   then falls back automatically.
 */

import type { TenantConfig } from "../types.js";
import type { SecretRef, SecretStore } from "@penelope/secrets";
import { McpConnector } from "../tier-mcp.js";
import type { McpConfig } from "../tier-mcp.js";

// ─── Capability list exposed to Penelope ─────────────────────────────────────

/**
 * The 8 Stripe MCP tools surfaced by this connector.
 * Maps 1:1 to tool names in @stripe/mcp.
 */
export const STRIPE_MCP_CAPABILITIES = [
  "list_customers",
  "create_customer",
  "list_payments",
  "create_payment_link",
  "list_subscriptions",
  "create_subscription",
  "refund_payment",
  "list_invoices",
] as const;

export type StripeMcpCapability = (typeof STRIPE_MCP_CAPABILITIES)[number];

// ─── Config ──────────────────────────────────────────────────────────────────

export interface StripeMcpTenantSettings {
  /**
   * Logical secret key used to look up the Stripe secret key in the tenant's
   * secret store.  Defaults to "STRIPE_SECRET_KEY".
   */
  stripeSecretKeyRef?: string;
}

// ─── Connector ───────────────────────────────────────────────────────────────

export class StripeMcpConnector extends McpConnector {
  readonly id = "stripe-mcp";
  readonly displayName = "Stripe (MCP)";
  readonly description =
    "Full Stripe payment processing — customers, payments, subscriptions, invoices, refunds — via the official @stripe/mcp server.";
  readonly category = "payments" as const;
  readonly capabilities = STRIPE_MCP_CAPABILITIES;

  /** Injected by init(); used to resolve the tenant's Stripe secret. */
  private _secretStore: SecretStore | null = null;

  // ─── McpConnector override ──────────────────────────────────────────────────

  /**
   * Resolve the Stripe API key from the tenant's secret store, then build the
   * stdio McpConfig that spawns `npx @stripe/mcp --tools=all --api-key=<key>`.
   */
  protected resolveMcpConfig(tenant: TenantConfig, secrets: SecretRef): McpConfig {
    const settings = (tenant.settings ?? {}) as StripeMcpTenantSettings;
    const secretKey = settings.stripeSecretKeyRef ?? "STRIPE_SECRET_KEY";

    // At resolve time we only have the SecretRef (a pointer), not the value.
    // The actual value is fetched asynchronously in init() before _connect().
    // We store it on the env so the child process receives it.
    const apiKey = this._resolvedApiKey;
    if (!apiKey) {
      throw new Error(
        `[StripeMcpConnector] Stripe API key not loaded — ` +
          `ensure secret "${secretKey}" is set for tenant "${tenant.tenantId}".`
      );
    }

    return {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@stripe/mcp", "--tools=all", `--api-key=${apiKey}`],
      env: {},
    };
  }

  /** Populated in init() before super.init() calls resolveMcpConfig(). */
  private _resolvedApiKey: string | null = null;

  /**
   * Overrides McpConnector.init() to:
   * 1. Resolve the Stripe API key from secrets before spawning the MCP child.
   * 2. Delegate the rest (spawn + MCP handshake) to the base class.
   */
  override async init(tenant: TenantConfig, secrets: SecretRef): Promise<void> {
    const settings = (tenant.settings ?? {}) as StripeMcpTenantSettings;
    const secretKeyName = settings.stripeSecretKeyRef ?? "STRIPE_SECRET_KEY";

    // If a store was injected (e.g. for testing), use it.
    // Otherwise fall back to the process environment for CI / simple setups.
    if (this._secretStore) {
      const ref: SecretRef = { tenantId: tenant.tenantId, key: secretKeyName };
      const value = await this._secretStore.get(ref);
      if (!value) {
        throw new Error(
          `[StripeMcpConnector] Secret "${secretKeyName}" not found for tenant "${tenant.tenantId}".`
        );
      }
      this._resolvedApiKey = value;
    } else {
      // Env-var fallback — useful for local dev and CI pipelines that set
      // STRIPE_SECRET_KEY in the environment without a full secrets store.
      const envKey = process.env[secretKeyName];
      if (!envKey) {
        throw new Error(
          `[StripeMcpConnector] Missing API key: secret "${secretKeyName}" not set ` +
            `for tenant "${tenant.tenantId}" and env var ${secretKeyName} is absent.`
        );
      }
      this._resolvedApiKey = envKey;
    }

    await super.init(tenant, secrets);
  }

  /**
   * Inject a SecretStore (e.g. in tests) instead of falling back to process.env.
   * Must be called before init().
   */
  withSecretStore(store: SecretStore): this {
    this._secretStore = store;
    return this;
  }
}
