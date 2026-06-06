import type { MCPConnectorDescriptor } from "../types.js";

export const pipedriveConnector: MCPConnectorDescriptor = {
  id: "pipedrive",
  vendor: "Pipedrive",
  category: "crm",
  mcp_server: "TODO:pipedrive-mcp",
  transport: "stdio",
  capabilities: [
    "contact.create",
    "contact.update",
    "contact.list",
    "deal.create",
    "deal.update",
    "deal.list",
    "activity.log",
    "pipeline.query",
  ],
  required_env: ["PIPEDRIVE_API_TOKEN"],
  owner_consent_required: [
    "contact.create",
    "contact.update",
    "deal.create",
    "deal.update",
  ],
  tenant_config_template: {
    company_domain: "",
    default_pipeline_id: "",
    owner_id: "",
  },
  docs_url: "https://developers.pipedrive.com/docs/api/v1",
  sample_procedure: "procedures/templates/crm/qualify-lead.yaml",
  registry_status: "community",
};
