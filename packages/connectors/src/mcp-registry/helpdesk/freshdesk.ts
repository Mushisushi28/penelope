import type { MCPConnectorDescriptor } from "../types.js";

export const freshdeskConnector: MCPConnectorDescriptor = {
  id: "freshdesk",
  vendor: "Freshdesk",
  category: "helpdesk",
  mcp_server: "TODO:effytech/freshdesk-mcp",
  transport: "stdio",
  capabilities: [
    "ticket.create",
    "ticket.update",
    "ticket.list",
    "ticket.reply",
    "ticket.resolve",
    "ticket.assign",
    "contact.create",
    "contact.list",
    "agent.list",
    "canned_response.list",
    "note.add",
  ],
  required_env: ["FRESHDESK_API_KEY", "FRESHDESK_DOMAIN"],
  owner_consent_required: [
    "ticket.reply",
    "ticket.resolve",
    "note.add",
  ],
  tenant_config_template: {
    domain: "",
    default_group_id: "",
    default_responder_id: "",
    auto_assign: false,
  },
  docs_url: "https://developers.freshdesk.com/api/",
  sample_procedure: "procedures/templates/helpdesk/resolve-ticket.yaml",
  registry_status: "community",
};
