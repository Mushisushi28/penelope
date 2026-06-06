import type { MCPConnectorDescriptor } from "../types.js";

export const posthogConnector: MCPConnectorDescriptor = {
  id: "posthog",
  vendor: "PostHog",
  category: "analytics",
  mcp_server: "@posthog/mcp",
  transport: "stdio",
  capabilities: [
    "event.capture",
    "event.query",
    "person.identify",
    "person.list",
    "insight.query",
    "funnel.query",
    "feature_flag.evaluate",
    "feature_flag.list",
    "experiment.list",
    "dashboard.list",
  ],
  required_env: ["POSTHOG_API_KEY", "POSTHOG_PROJECT_ID"],
  owner_consent_required: [
    "event.capture",
    "person.identify",
  ],
  tenant_config_template: {
    host: "https://app.posthog.com",
    project_id: "",
    batch_size: 100,
  },
  docs_url: "https://posthog.com/docs/api",
  sample_procedure: "procedures/templates/analytics/track-conversion-event.yaml",
  registry_status: "official",
};
