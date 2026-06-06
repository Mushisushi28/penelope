import type { MCPConnectorDescriptor } from "../types.js";

export const brightlocalConnector: MCPConnectorDescriptor = {
  id: "brightlocal",
  vendor: "BrightLocal",
  category: "reviews",
  mcp_server: "TODO:brightlocal-mcp",
  transport: "stdio",
  capabilities: [
    "review.list",
    "review.respond",
    "review.monitor",
    "citation.audit",
    "citation.build",
    "ranking.track",
    "report.local_seo",
    "location.manage",
    "reputation.score",
  ],
  required_env: ["BRIGHTLOCAL_API_KEY"],
  owner_consent_required: [
    "review.respond",
    "citation.build",
  ],
  tenant_config_template: {
    location_id: "",
    business_name: "",
    review_sources: ["google", "facebook", "yelp"],
    auto_respond: false,
  },
  docs_url: "https://brightlocal.com/docs/api",
  sample_procedure: "procedures/templates/reviews/respond-to-reviews.yaml",
  registry_status: "community",
};
