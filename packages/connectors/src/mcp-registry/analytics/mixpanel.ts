import type { MCPConnectorDescriptor } from "../types.js";

export const mixpanelConnector: MCPConnectorDescriptor = {
  id: "mixpanel",
  vendor: "Mixpanel",
  category: "analytics",
  mcp_server: "TODO:mixpanel-mcp",
  transport: "stdio",
  capabilities: [
    "event.track",
    "event.query",
    "user.identify",
    "user.set",
    "user.list",
    "funnel.query",
    "retention.query",
    "report.query",
    "cohort.list",
  ],
  required_env: ["MIXPANEL_PROJECT_TOKEN", "MIXPANEL_SERVICE_ACCOUNT_USERNAME", "MIXPANEL_SERVICE_ACCOUNT_SECRET"],
  owner_consent_required: [
    "event.track",
    "user.identify",
    "user.set",
  ],
  tenant_config_template: {
    project_id: "",
    region: "US",
    data_residency: "US",
  },
  docs_url: "https://developer.mixpanel.com/reference/overview",
  sample_procedure: "procedures/templates/analytics/track-conversion-event.yaml",
  registry_status: "official",
};
