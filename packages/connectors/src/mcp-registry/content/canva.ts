import type { MCPConnectorDescriptor } from "../types.js";

export const canvaConnector: MCPConnectorDescriptor = {
  id: "canva",
  vendor: "Canva",
  category: "content",
  mcp_server: "@canva/mcp-server",
  transport: "sse",
  capabilities: [
    "design.create",
    "design.list",
    "design.export",
    "design.edit",
    "template.search",
    "template.use",
    "image.generate",
    "brand_kit.apply",
    "folder.create",
    "folder.list",
  ],
  required_env: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"],
  owner_consent_required: [
    "design.create",
    "design.edit",
    "design.export",
    "image.generate",
  ],
  tenant_config_template: {
    team_id: "",
    default_brand_kit_id: "",
    output_format: "png",
  },
  docs_url: "https://www.canva.dev/docs/connect/",
  sample_procedure: "procedures/templates/content/generate-social-post.yaml",
  registry_status: "official",
};
