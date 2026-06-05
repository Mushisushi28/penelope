/**
 * PaymentReconcilerSpecialist — reconciles payments, manages customers and
 * subscriptions, issues refunds, and lists invoices.
 *
 * Connector routing (tier-first):
 *   1. stripe-mcp  — Tier 1 MCP connector (preferred when available).
 *      Spawns `npx @stripe/mcp --tools=all` as a child process; richest
 *      capability set, zero hand-rolled HTTP.
 *   2. @penelope/billing stripe-client — Tier 2 direct Stripe wrapper.
 *      Falls back automatically when stripe-mcp is not initialised or
 *      when STRIPE_MCP_DISABLED=true is set.
 *
 * This specialist NEVER acquires a telegram-owner adapter.
 * All results are published to the loom-a2a bus; Penelope relays to the owner.
 */

import { SpecialistAgent, type SpecialistConfig } from "./base.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentReconcilerConfig extends SpecialistConfig {
  /** Set to true to skip stripe-mcp and use the billing wrapper directly. */
  disableMcp?: boolean;
}

export type PaymentAction =
  | "list_customers"
  | "create_customer"
  | "list_payments"
  | "create_payment_link"
  | "list_subscriptions"
  | "create_subscription"
  | "refund_payment"
  | "list_invoices";

// ─── Thin connector interfaces (avoid hard build-time deps) ────────────────────
//
// We type only what we need from each package so this specialist compiles even
// before @penelope/connectors and @penelope/billing are fully built.

interface McpLikeConnector {
  init(tenant: { tenantId: string }, secrets: { tenantId: string; key: string }): Promise<void>;
  invoke(op: string, args: unknown): Promise<unknown>;
}

interface BillingLike {
  createCustomer(params: { tenantId: string; email: string; name?: string }): Promise<{ customerId: string }>;
  listInvoices(customerId: string): Promise<unknown[]>;
}

// ─── PaymentReconcilerSpecialist ──────────────────────────────────────────────

export class PaymentReconcilerSpecialist extends SpecialistAgent {
  private readonly reconcilerConfig: PaymentReconcilerConfig;

  /** Injected stripe-mcp connector — set via withMcpConnector(). */
  private _mcpConnector: McpLikeConnector | null = null;

  /** Injected billing wrapper — set via withBillingClient(). */
  private _billingClient: BillingLike | null = null;

  /** True after the MCP connector has been successfully initialised. */
  private _mcpReady = false;

  constructor(config: PaymentReconcilerConfig) {
    super({ role: "payment-reconciler", tenant_id: config.tenant_id });
    this.reconcilerConfig = config;
  }

  // ─── Dependency injection ─────────────────────────────────────────────────

  /**
   * Inject a stripe-mcp connector instance (Tier 1).
   * Typically called by Penelope's wiring layer at startup.
   */
  withMcpConnector(connector: McpLikeConnector): this {
    this._mcpConnector = connector;
    return this;
  }

  /**
   * Inject a direct Stripe billing client (Tier 2 fallback).
   * Typically the @penelope/billing stripe-client module bound to a specific
   * tenant's secret key.
   */
  withBillingClient(client: BillingLike): this {
    this._billingClient = client;
    return this;
  }

  // ─── Initialise the preferred connector ───────────────────────────────────

  /**
   * Attempt to initialise the stripe-mcp connector.
   * On failure, silently falls back to the billing wrapper (if available).
   * This method is idempotent — safe to call multiple times.
   */
  async initConnector(): Promise<void> {
    if (this._mcpReady) return;
    if (this.reconcilerConfig.disableMcp ?? process.env["STRIPE_MCP_DISABLED"] === "true") {
      return; // caller elected to skip MCP tier
    }
    if (!this._mcpConnector) {
      // Lazily load from @penelope/connectors if available in the runtime.
      try {
        const { StripeMcpConnector } = await import(
          "@penelope/connectors/src/connectors/stripe-mcp.js"
        );
        this._mcpConnector = new StripeMcpConnector() as McpLikeConnector;
      } catch {
        // @penelope/connectors not available at runtime — fall back silently.
        return;
      }
    }

    try {
      await this._mcpConnector.init(
        { tenantId: this.tenantId },
        { tenantId: this.tenantId, key: "STRIPE_SECRET_KEY" },
      );
      this._mcpReady = true;
    } catch (err) {
      // Log and fall back — the billing wrapper handles the request instead.
      process.stderr.write(
        `[PaymentReconcilerSpecialist] stripe-mcp init failed, falling back to billing: ${String(err)}\n`,
      );
    }
  }

  // ─── Dispatch helpers ─────────────────────────────────────────────────────

  /**
   * Route an operation through stripe-mcp when ready; otherwise attempt the
   * billing wrapper; otherwise throw with a clear message.
   */
  private async _dispatch(op: PaymentAction, args: unknown): Promise<unknown> {
    await this.initConnector();

    // Tier 1: MCP
    if (this._mcpReady && this._mcpConnector) {
      return this._mcpConnector.invoke(op, args);
    }

    // Tier 2: billing wrapper — supports a subset of ops
    if (this._billingClient) {
      return this._billingFallback(op, args);
    }

    throw new Error(
      `[PaymentReconcilerSpecialist] No Stripe connector available for op "${op}". ` +
        "Ensure stripe-mcp or @penelope/billing is wired before dispatching.",
    );
  }

  /**
   * Minimal billing-wrapper fallback for ops supported by @penelope/billing.
   */
  private async _billingFallback(op: PaymentAction, args: unknown): Promise<unknown> {
    const client = this._billingClient!;
    const a = args as Record<string, unknown>;

    switch (op) {
      case "create_customer":
        return client.createCustomer({
          tenantId: this.tenantId,
          email: String(a["email"] ?? ""),
          name: a["name"] !== undefined ? String(a["name"]) : undefined,
        });

      case "list_invoices":
        return client.listInvoices(String(a["customer_id"] ?? ""));

      default:
        throw new Error(
          `[PaymentReconcilerSpecialist] Op "${op}" is not supported by the billing fallback. ` +
            "Enable stripe-mcp for full coverage.",
        );
    }
  }

  // ─── SpecialistAgent.run (bus entry point) ────────────────────────────────

  async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const action = (payload["action"] as PaymentAction | undefined);
    if (!action) {
      throw new Error(
        "[PaymentReconcilerSpecialist] payload.action is required. " +
          "Expected one of: list_customers | create_customer | list_payments | " +
          "create_payment_link | list_subscriptions | create_subscription | " +
          "refund_payment | list_invoices",
      );
    }

    const result = await this._dispatch(action, payload["args"] ?? {});
    return { ok: true, action, result };
  }
}
