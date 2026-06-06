import type { MCPConnectorDescriptor } from "../types.js";

export const zapierConnector: MCPConnectorDescriptor = {
  id: "zapier",
  vendor: "Zapier",
  category: "automation",
  mcp_server: "@zapier/mcp",
  transport: "sse",
  capabilities: [
    "zap.trigger",
    "zap.list",
    "zap.create",
    "zap.enable",
    "zap.disable",
    "action.run",
    "webhook.send",
  ],
  required_env: ["ZAPIER_MCP_URL"],
  owner_consent_required: [
    "zap.trigger",
    "action.run",
    "webhook.send",
    "zap.create",
    "zap.enable",
  ],
  tenant_config_template: {
    mcp_server_url: "",
    max_actions: 30000,
  },
  docs_url: "https://platform.zapier.com/docs/zapier-mcp",
  sample_procedure: "procedures/templates/automation/trigger-zap-on-payment.yaml",
  registry_status: "official",
};
