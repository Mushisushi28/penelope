/**
 * @penelope/connectors — unified Connector interface and supporting types
 *
 * Five-tier hierarchy (lowest-number = highest preference):
 *   1  mcp            — rich MCP server (stdio or SSE)
 *   2  api-skill      — hand-coded opinionated TypeScript wrapper
 *   3  hermes-openapi — auto-generated from an OpenAPI spec via @penelope/hermes
 *   4  browser        — open-claude-in-chrome MCP extension driving a web UI
 *   5  computer-use   — Anthropic computer-use beta (last resort, highest cost)
 */

import type { SecretRef } from "@penelope/secrets";

// ─── Enumerations ──────────────────────────────────────────────────────────────

export type Tier =
  | "mcp"
  | "api-skill"
  | "hermes-openapi"
  | "browser"
  | "computer-use";

export type Category =
  | "payments"
  | "calendar"
  | "email"
  | "sms"
  | "messaging"
  | "crm"
  | "reviews"
  | "pos"
  | "accounting"
  | "ads"
  | "social"
  | "forms"
  | "bookings"
  | "inventory"
  | "shipping"
  | "maps"
  | "files"
  | "esign"
  | "support"
  | "website"
  | "domains"
  | "other";

export type Capability =
  | "send-message"
  | "receive-message"
  | "list-records"
  | "create-record"
  | "update-record"
  | "delete-record"
  | "search"
  | "charge"
  | "refund"
  | "schedule-event"
  | "cancel-event"
  | "list-events"
  | "send-email"
  | "send-sms"
  | "upload-file"
  | "download-file"
  | "post-content"
  | "run-ad"
  | "review-ask"
  | "sign-document"
  | "webhook-listen"
  | string; // extensible

// ─── Tenant configuration ──────────────────────────────────────────────────────

/** Runtime configuration supplied per-tenant. */
export interface TenantConfig {
  /** Unique tenant slug, e.g. "acme-corp". */
  readonly tenantId: string;
  /** Optional connector-specific settings (timeouts, base URLs, etc.). */
  readonly settings?: Record<string, unknown>;
}

// ─── Connector interface ───────────────────────────────────────────────────────

export interface Connector {
  /** Unique stable identifier, e.g. "stripe", "google-calendar". */
  readonly id: string;

  /** Display name for UI/logging. */
  readonly displayName: string;

  /** Short description surfaced in marketplace / dashboards. */
  readonly description: string;

  /** Integration tier — determines dispatch path. */
  readonly tier: Tier;

  /** Functional category for grouping and discovery. */
  readonly category: Category;

  /** Specific operations this connector supports. */
  readonly capabilities: ReadonlyArray<Capability>;

  /**
   * Prepare the connector for use.
   * Called once per tenant session before `invoke`.
   */
  init(tenant: TenantConfig, secrets: SecretRef): Promise<void>;

  /**
   * Execute a named operation.
   * @param op   - operation name, e.g. "send-message", "create-record"
   * @param args - operation-specific arguments (validated by each tier impl)
   */
  invoke(op: string, args: unknown): Promise<unknown>;

  /**
   * Verify connectivity and credential validity.
   * Must not throw — returns `ok: false` with details on failure.
   */
  healthCheck(): Promise<{ ok: boolean; details?: string }>;
}

// ─── Descriptor (metadata-only, no runtime methods) ───────────────────────────

/**
 * Lightweight descriptor stored in the registry for connectors that are not
 * yet fully implemented (stubs in the v0.2 catalog).
 */
export interface ConnectorDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly tier: Tier;
  readonly category: Category;
  readonly capabilities: ReadonlyArray<Capability>;
  readonly implementationStatus: "full" | "stub";
}
