import type { MCPConnectorDescriptor } from "../types.js";

export const vapiConnector: MCPConnectorDescriptor = {
  id: "vapi",
  vendor: "Vapi",
  category: "voice-ai",
  mcp_server: "@vapi-ai/mcp-server",
  transport: "stdio",
  capabilities: [
    "call.create",
    "call.end",
    "call.list",
    "call.transfer",
    "assistant.create",
    "assistant.update",
    "assistant.list",
    "phone_number.list",
    "phone_number.create",
    "transcript.get",
    "recording.get",
    "squad.create",
  ],
  required_env: ["VAPI_API_KEY"],
  owner_consent_required: [
    "call.create",
    "call.transfer",
    "phone_number.create",
    "assistant.create",
  ],
  tenant_config_template: {
    default_assistant_id: "",
    phone_number_id: "",
    voice_model: "eleven_turbo_v2_5",
    language: "en-US",
  },
  docs_url: "https://docs.vapi.ai/api-reference",
  sample_procedure: "procedures/templates/voice-ai/outbound-followup-call.yaml",
  registry_status: "official",
};
