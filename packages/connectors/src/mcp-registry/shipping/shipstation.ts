import type { MCPConnectorDescriptor } from "../types.js";

export const shipstationConnector: MCPConnectorDescriptor = {
  id: "shipstation",
  vendor: "ShipStation",
  category: "shipping",
  mcp_server: "TODO:shipstation-mcp",
  transport: "stdio",
  capabilities: [
    "shipment.create",
    "shipment.list",
    "shipment.track",
    "label.create",
    "label.void",
    "order.import",
    "order.list",
    "order.ship",
    "carrier.list",
    "rate.query",
    "warehouse.list",
  ],
  required_env: ["SHIPSTATION_API_KEY", "SHIPSTATION_API_SECRET"],
  owner_consent_required: [
    "shipment.create",
    "label.create",
    "order.ship",
  ],
  tenant_config_template: {
    store_id: "",
    default_carrier_code: "stamps_com",
    default_service_code: "usps_priority_mail",
    default_warehouse_id: "",
  },
  docs_url: "https://www.shipstation.com/docs/api/",
  sample_procedure: "procedures/templates/shipping/create-shipment.yaml",
  registry_status: "community",
};
