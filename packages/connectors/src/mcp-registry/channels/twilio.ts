import type { MCPConnectorDescriptor } from "../types.js";

export const twilioConnector: MCPConnectorDescriptor = {
  id: "twilio",
  vendor: "Twilio",
  category: "channels",
  mcp_server: "TODO:twilio-mcp",
  transport: "stdio",
  capabilities: [
    "sms.send",
    "sms.list",
    "call.create",
    "call.list",
    "phone_number.list",
    "phone_number.purchase",
    "whatsapp.send",
    "verify.send",
    "verify.check",
    "recording.list",
  ],
  required_env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  owner_consent_required: [
    "sms.send",
    "call.create",
    "whatsapp.send",
    "phone_number.purchase",
    "verify.send",
  ],
  tenant_config_template: {
    from_number: "",
    messaging_service_sid: "",
    default_country_code: "+1",
  },
  docs_url: "https://www.twilio.com/docs/usage/api",
  sample_procedure: "procedures/templates/channels/send-sms-notification.yaml",
  registry_status: "alpha",
};
