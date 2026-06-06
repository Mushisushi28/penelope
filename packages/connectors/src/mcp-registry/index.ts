/**
 * @penelope/connectors — MCP Registry
 *
 * Wave-1 catalog of 25 MCP servers wired as Penelope connectors.
 * All entries are pure metadata descriptors — no package installs,
 * no runtime spawning. Actual invocation happens via McpConnector at
 * tenant runtime once the server is provisioned and env vars are present.
 */

export type { MCPConnectorDescriptor, MCPCategory, McpTransportKind } from "./types.js";

// Payments
import { stripeConnector } from "./payments/stripe.js";

// CRM
import { hubspotConnector } from "./crm/hubspot.js";
import { pipedriveConnector } from "./crm/pipedrive.js";

// Inbox
import { chatwootConnector } from "./inbox/chatwoot.js";

// Booking
import { calComConnector } from "./booking/cal-com.js";
import { calendlyConnector } from "./booking/calendly.js";

// Email / SMS marketing
import { klaviyoConnector } from "./email-sms/klaviyo.js";

// Accounting
import { quickbooksConnector } from "./accounting/quickbooks.js";
import { xeroConnector } from "./accounting/xero.js";

// Reviews / Local SEO
import { brightlocalConnector } from "./reviews/brightlocal.js";

// Helpdesk
import { freshdeskConnector } from "./helpdesk/freshdesk.js";
import { zendeskConnector } from "./helpdesk/zendesk.js";

// Voice AI
import { vapiConnector } from "./voice-ai/vapi.js";

// Payroll
import { gustoConnector } from "./payroll/gusto.js";

// Project management
import { asanaConnector } from "./project-mgmt/asana.js";
import { clickupConnector } from "./project-mgmt/clickup.js";
import { linearConnector } from "./project-mgmt/linear.js";

// E-signature
import { pandadocConnector } from "./esign/pandadoc.js";

// Surveys
import { tallyConnector } from "./surveys/tally.js";

// Automation
import { zapierConnector } from "./automation/zapier.js";

// Analytics
import { posthogConnector } from "./analytics/posthog.js";
import { mixpanelConnector } from "./analytics/mixpanel.js";

// Shipping
import { shipstationConnector } from "./shipping/shipstation.js";

// Inventory
import { inflowConnector } from "./inventory/inflow.js";

// Billing
import { chargebeeConnector } from "./billing/chargebee.js";

// Content creation
import { canvaConnector } from "./content/canva.js";

// Channels / communication infra
import { twilioConnector } from "./channels/twilio.js";

import type { MCPConnectorDescriptor, MCPCategory } from "./types.js";

/** Full Wave-1 catalog — 25 connectors. */
export const mcpRegistry: readonly MCPConnectorDescriptor[] = [
  // P0 — 10 core categories
  stripeConnector,
  hubspotConnector,
  pipedriveConnector,
  chatwootConnector,
  calComConnector,
  calendlyConnector,
  klaviyoConnector,
  quickbooksConnector,
  xeroConnector,
  brightlocalConnector,
  freshdeskConnector,
  zendeskConnector,
  vapiConnector,
  gustoConnector,
  // Extended catalog
  asanaConnector,
  clickupConnector,
  linearConnector,
  pandadocConnector,
  tallyConnector,
  zapierConnector,
  posthogConnector,
  mixpanelConnector,
  shipstationConnector,
  inflowConnector,
  chargebeeConnector,
  canvaConnector,
  twilioConnector,
];

/**
 * Returns all connectors in the given MCP category.
 */
export function getMCPByCategory(category: MCPCategory): readonly MCPConnectorDescriptor[] {
  return mcpRegistry.filter((c) => c.category === category);
}

/**
 * Returns the connector with the given id, or undefined.
 */
export function getMCPById(id: string): MCPConnectorDescriptor | undefined {
  return mcpRegistry.find((c) => c.id === id);
}
