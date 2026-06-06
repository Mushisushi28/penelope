import type { MCPConnectorDescriptor } from "../types.js";

export const chatwootConnector: MCPConnectorDescriptor = {
  id: "chatwoot",
  vendor: "Chatwoot",
  category: "inbox",
  mcp_server: "TODO:fazer-ai/mcp-chatwoot",
  transport: "stdio",
  capabilities: [
    "conversation.list",
    "conversation.assign",
    "conversation.reply",
    "conversation.resolve",
    "contact.create",
    "contact.list",
    "message.send",
    "label.assign",
    "inbox.list",
    "report.query",
  ],
  required_env: ["CHATWOOT_API_TOKEN", "CHATWOOT_BASE_URL"],
  owner_consent_required: [
    "conversation.reply",
    "message.send",
  ],
  tenant_config_template: {
    base_url: "https://app.chatwoot.com",
    account_id: "",
    default_inbox_id: "",
    auto_assign_agent_id: "",
  },
  docs_url: "https://www.chatwoot.com/developers/api",
  sample_procedure: "procedures/templates/inbox/triage-inbound.yaml",
  registry_status: "community",
};
