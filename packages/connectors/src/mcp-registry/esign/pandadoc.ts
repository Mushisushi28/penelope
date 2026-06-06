import type { MCPConnectorDescriptor } from "../types.js";

export const pandadocConnector: MCPConnectorDescriptor = {
  id: "pandadoc",
  vendor: "PandaDoc",
  category: "esign",
  mcp_server: "pandadoc-mcp",
  transport: "stdio",
  capabilities: [
    "document.create",
    "document.send",
    "document.list",
    "document.status",
    "document.download",
    "template.list",
    "template.use",
    "contact.create",
    "contact.list",
    "field.fill",
  ],
  required_env: ["PANDADOC_API_KEY"],
  owner_consent_required: [
    "document.create",
    "document.send",
    "field.fill",
  ],
  tenant_config_template: {
    workspace_id: "",
    default_template_id: "",
    sender_name: "",
    sender_email: "",
  },
  docs_url: "https://developers.pandadoc.com/reference/about",
  sample_procedure: "procedures/templates/esign/send-service-agreement.yaml",
  registry_status: "official",
};
