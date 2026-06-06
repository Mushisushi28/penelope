/**
 * @penelope/connectors — MCP Connector Descriptor
 *
 * Lightweight metadata record for each MCP server in the Wave 1 catalog.
 * Descriptors are pure data — no runtime methods. Actual invocation happens
 * via McpConnector at tenant runtime once the server is provisioned.
 *
 * Design rules:
 *  - owner_consent_required lists every capability that costs money, sends
 *    an outbound message, or mutates third-party state. Owner must approve
 *    before these ops are dispatched.
 *  - required_env lists the env-var names that MUST be present in the tenant
 *    secret store before the server can be spawned.
 *  - mcp_server is the package name / URL as it would appear in an MCP config.
 *    Unknown packages are prefixed with "TODO:" so the catalog remains honest.
 */

export type McpTransportKind = "stdio" | "sse" | "http";

export type MCPCategory =
  | "payments"
  | "crm"
  | "inbox"
  | "booking"
  | "email-sms"
  | "accounting"
  | "reviews"
  | "helpdesk"
  | "voice-ai"
  | "payroll"
  | "project-mgmt"
  | "esign"
  | "analytics"
  | "automation"
  | "ecommerce"
  | "inventory"
  | "shipping"
  | "billing"
  | "surveys"
  | "content"
  | "channels";

export interface MCPConnectorDescriptor {
  /** Stable unique identifier, kebab-case. */
  readonly id: string;

  /** Human-readable vendor name. */
  readonly vendor: string;

  /** MCPCategory bucket for this connector. */
  readonly category: MCPCategory;

  /**
   * MCP server package or URL.
   * Prefix "TODO:" when official package name is uncertain.
   */
  readonly mcp_server: string;

  /** How the MCP server is spawned. */
  readonly transport: McpTransportKind;

  /**
   * Named capabilities this connector exposes.
   * Use verb.noun format, e.g. "payment.charge", "contact.create".
   */
  readonly capabilities: readonly string[];

  /**
   * Env-var names required in the tenant secret store before spawn.
   * Keys are logical names resolved at runtime (not literal env var values).
   */
  readonly required_env: readonly string[];

  /**
   * Capabilities in this list require owner approval before dispatch.
   * Gate: connector-router checks owner_consent_required before invoking.
   */
  readonly owner_consent_required: readonly string[];

  /**
   * Connector-specific configuration template (schema, not values).
   * Shown to owners during onboarding so they know what to configure.
   */
  readonly tenant_config_template: Record<string, unknown>;

  /** Canonical API docs for this vendor. */
  readonly docs_url: string;

  /**
   * Path (relative to repo root) to a sample procedure that uses this connector.
   * Absent when not yet written.
   */
  readonly sample_procedure?: string;

  /**
   * "official" — published by the vendor directly.
   * "community" — published by third party.
   * "alpha" / "beta" — vendor-published but pre-GA.
   * "TODO" — existence confirmed in sweep but package name unverified.
   */
  readonly registry_status: "official" | "community" | "alpha" | "beta" | "TODO";
}
