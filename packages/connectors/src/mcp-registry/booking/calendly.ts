import type { MCPConnectorDescriptor } from "../types.js";

export const calendlyConnector: MCPConnectorDescriptor = {
  id: "calendly",
  vendor: "Calendly",
  category: "booking",
  mcp_server: "@calendly/mcp",
  transport: "sse",
  capabilities: [
    "booking.create",
    "booking.cancel",
    "booking.list",
    "availability.query",
    "event_type.list",
    "invitee.list",
    "webhook.subscribe",
  ],
  required_env: ["CALENDLY_PERSONAL_ACCESS_TOKEN"],
  owner_consent_required: [
    "booking.create",
    "booking.cancel",
    "webhook.subscribe",
  ],
  tenant_config_template: {
    organization_uri: "",
    user_uri: "",
    default_event_type_uri: "",
  },
  docs_url: "https://developer.calendly.com/api-docs",
  sample_procedure: "procedures/templates/booking/confirm-appointment.yaml",
  registry_status: "official",
};
