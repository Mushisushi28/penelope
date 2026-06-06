/**
 * Penelope — Connector-Router Specialist
 *
 * Thin specialist that maps a structured bus event to an MCP connector
 * invocation. All connector-router traffic flows over the internal bus —
 * this specialist never acquires the telegram-owner adapter.
 *
 * Consent gate: any capability listed in `owner_consent_required` on the
 * matched MCPConnectorDescriptor is blocked until owner approval is
 * recorded on the bus topic `connector.consent.granted`.
 *
 * Bus events consumed:
 *   connector.invoke.requested  — { connector_id, capability, args, tenant_id }
 *
 * Bus events emitted:
 *   connector.invoked           — success result
 *   connector.consent.required  — capability needs owner approval
 *   connector.error             — invocation failed
 */

import { getMCPById } from "@penelope/connectors/mcp-registry";
import type { MCPConnectorDescriptor } from "@penelope/connectors/mcp-registry";

export interface ConnectorInvokeRequest {
  connector_id: string;
  capability: string;
  args: Record<string, unknown>;
  tenant_id: string;
  /** Set by consent flow once owner approves write ops. */
  consent_token?: string;
}

export interface ConnectorInvokeResult {
  connector_id: string;
  capability: string;
  tenant_id: string;
  result?: unknown;
  error?: string;
  consent_required?: boolean;
  required_env_missing?: string[];
}

/**
 * Resolve which connector handles the request and validate preconditions.
 * Returns a result envelope — the caller publishes it to the appropriate bus topic.
 *
 * This function is pure (no I/O, no MCP spawn) so it can be unit-tested
 * without real credentials.
 */
export function routeConnectorRequest(
  req: ConnectorInvokeRequest,
  /** env var names present in the tenant secret store (for validation). */
  availableEnv: readonly string[],
  /** capability tokens previously approved by owner (from consent store). */
  approvedCapabilities: readonly string[],
): ConnectorInvokeResult {
  const descriptor: MCPConnectorDescriptor | undefined = getMCPById(req.connector_id);

  if (!descriptor) {
    return {
      connector_id: req.connector_id,
      capability: req.capability,
      tenant_id: req.tenant_id,
      error: `No connector registered with id '${req.connector_id}'`,
    };
  }

  // Capability must be declared on the descriptor.
  if (!descriptor.capabilities.includes(req.capability)) {
    return {
      connector_id: req.connector_id,
      capability: req.capability,
      tenant_id: req.tenant_id,
      error: `Connector '${req.connector_id}' does not expose capability '${req.capability}'`,
    };
  }

  // Check all required env vars are present.
  const missingEnv = descriptor.required_env.filter(
    (e) => !availableEnv.includes(e),
  );
  if (missingEnv.length > 0) {
    return {
      connector_id: req.connector_id,
      capability: req.capability,
      tenant_id: req.tenant_id,
      error: `Missing required env vars: ${missingEnv.join(", ")}`,
      required_env_missing: missingEnv,
    };
  }

  // Owner-consent gate: block write/send/money ops unless explicitly approved.
  const needsConsent = descriptor.owner_consent_required.includes(req.capability);
  if (needsConsent && !approvedCapabilities.includes(`${req.connector_id}:${req.capability}`)) {
    return {
      connector_id: req.connector_id,
      capability: req.capability,
      tenant_id: req.tenant_id,
      consent_required: true,
    };
  }

  // Preconditions satisfied — return an "approved for dispatch" envelope.
  // Actual MCP spawn / stdio invocation happens in the runtime layer.
  return {
    connector_id: req.connector_id,
    capability: req.capability,
    tenant_id: req.tenant_id,
    result: { status: "approved_for_dispatch", descriptor_id: descriptor.id },
  };
}

/** Bus topic constants consumed/emitted by this specialist. */
export const CONNECTOR_TOPICS = {
  REQUEST: "connector.invoke.requested",
  INVOKED: "connector.invoked",
  CONSENT_REQUIRED: "connector.consent.required",
  CONSENT_GRANTED: "connector.consent.granted",
  ERROR: "connector.error",
} as const;
