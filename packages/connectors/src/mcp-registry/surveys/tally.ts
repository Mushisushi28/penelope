import type { MCPConnectorDescriptor } from "../types.js";

export const tallyConnector: MCPConnectorDescriptor = {
  id: "tally",
  vendor: "Tally",
  category: "surveys",
  mcp_server: "tally-mcp",
  transport: "stdio",
  capabilities: [
    "form.create",
    "form.list",
    "form.publish",
    "response.list",
    "response.export",
    "submission.list",
    "webhook.create",
  ],
  required_env: ["TALLY_API_KEY"],
  owner_consent_required: [
    "form.publish",
    "webhook.create",
  ],
  tenant_config_template: {
    workspace_id: "",
    default_form_template: "",
  },
  docs_url: "https://tally.so/help/api",
  sample_procedure: "procedures/templates/surveys/post-job-satisfaction-survey.yaml",
  registry_status: "official",
};
