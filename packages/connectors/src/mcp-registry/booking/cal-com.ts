import type { MCPConnectorDescriptor } from "../types.js";

export const calComConnector: MCPConnectorDescriptor = {
  id: "cal-com",
  vendor: "Cal.com",
  category: "booking",
  mcp_server: "@calcom/mcp",
  transport: "sse",
  capabilities: [
    "booking.create",
    "booking.cancel",
    "booking.reschedule",
    "booking.list",
    "availability.query",
    "event_type.list",
    "event_type.create",
    "schedule.set",
    "attendee.list",
  ],
  required_env: ["CAL_COM_API_KEY"],
  owner_consent_required: [
    "booking.create",
    "booking.cancel",
    "booking.reschedule",
  ],
  tenant_config_template: {
    base_url: "https://api.cal.com",
    default_event_type_id: "",
    timezone: "UTC",
    auto_confirm: false,
  },
  docs_url: "https://cal.com/docs/api-reference",
  sample_procedure: "procedures/templates/booking/confirm-appointment.yaml",
  registry_status: "official",
};
