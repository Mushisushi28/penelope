import type { MCPConnectorDescriptor } from "../types.js";

export const inflowConnector: MCPConnectorDescriptor = {
  id: "inflow",
  vendor: "inFlow Inventory",
  category: "inventory",
  mcp_server: "TODO:inflow-mcp-server",
  transport: "stdio",
  capabilities: [
    "product.list",
    "product.create",
    "product.update",
    "stock.query",
    "stock.adjust",
    "order.create",
    "order.list",
    "order.fulfill",
    "purchase_order.create",
    "purchase_order.list",
    "location.list",
  ],
  required_env: ["INFLOW_API_KEY"],
  owner_consent_required: [
    "stock.adjust",
    "order.create",
    "order.fulfill",
    "purchase_order.create",
  ],
  tenant_config_template: {
    company_id: "",
    default_location_id: "",
    default_currency: "USD",
  },
  docs_url: "https://cloudhelp.inflowinventory.com/api/",
  sample_procedure: "procedures/templates/inventory/check-stock-levels.yaml",
  registry_status: "community",
};
