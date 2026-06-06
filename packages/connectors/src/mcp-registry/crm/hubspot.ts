import type { MCPConnectorDescriptor } from "../types.js";

export const hubspotConnector: MCPConnectorDescriptor = {
  id: "hubspot",
  vendor: "HubSpot",
  category: "crm",
  mcp_server: "@hubspot/mcp-server",
  transport: "stdio",
  capabilities: [
    "contact.create",
    "contact.update",
    "contact.list",
    "contact.search",
    "deal.create",
    "deal.update",
    "deal.list",
    "activity.log",
    "pipeline.query",
    "task.create",
  ],
  required_env: ["HUBSPOT_ACCESS_TOKEN"],
  owner_consent_required: [
    "contact.create",
    "contact.update",
    "deal.create",
    "deal.update",
    "activity.log",
  ],
  tenant_config_template: {
    portal_id: "",
    default_pipeline_id: "",
    owner_id: "",
  },
  docs_url: "https://developers.hubspot.com/docs/api/overview",
  sample_procedure: "procedures/templates/crm/qualify-lead.yaml",
  registry_status: "official",
};
