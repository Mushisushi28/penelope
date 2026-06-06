import type { MCPConnectorDescriptor } from "../types.js";

export const quickbooksConnector: MCPConnectorDescriptor = {
  id: "quickbooks-online",
  vendor: "QuickBooks Online",
  category: "accounting",
  mcp_server: "TODO:intuit/quickbooks-online-mcp-server",
  transport: "stdio",
  capabilities: [
    "invoice.create",
    "invoice.send",
    "invoice.list",
    "invoice.update",
    "payment.record",
    "payment.list",
    "customer.create",
    "customer.list",
    "expense.create",
    "expense.list",
    "report.profit_loss",
    "report.balance_sheet",
    "account.list",
  ],
  required_env: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REFRESH_TOKEN"],
  owner_consent_required: [
    "invoice.create",
    "invoice.send",
    "payment.record",
    "expense.create",
  ],
  tenant_config_template: {
    realm_id: "",
    environment: "production",
    minor_version: "65",
  },
  docs_url: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting",
  sample_procedure: "procedures/templates/accounting/generate-invoice.yaml",
  registry_status: "TODO",
};
