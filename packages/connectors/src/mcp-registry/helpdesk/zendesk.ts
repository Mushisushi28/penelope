import type { MCPConnectorDescriptor } from "../types.js";

export const zendeskConnector: MCPConnectorDescriptor = {
  id: "zendesk",
  vendor: "Zendesk",
  category: "helpdesk",
  mcp_server: "TODO:mattcoatsworth/zendesk-mcp",
  transport: "stdio",
  capabilities: [
    "ticket.create",
    "ticket.update",
    "ticket.list",
    "ticket.reply",
    "ticket.resolve",
    "ticket.assign",
    "ticket.tag",
    "user.create",
    "user.list",
    "article.list",
    "macro.apply",
  ],
  required_env: ["ZENDESK_API_TOKEN", "ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL"],
  owner_consent_required: [
    "ticket.reply",
    "ticket.resolve",
    "macro.apply",
  ],
  tenant_config_template: {
    subdomain: "",
    default_assignee_id: "",
    default_group_id: "",
    brand_id: "",
  },
  docs_url: "https://developer.zendesk.com/api-reference/",
  sample_procedure: "procedures/templates/helpdesk/resolve-ticket.yaml",
  registry_status: "community",
};
