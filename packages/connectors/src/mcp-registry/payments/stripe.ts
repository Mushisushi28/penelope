import type { MCPConnectorDescriptor } from "../types.js";

export const stripeConnector: MCPConnectorDescriptor = {
  id: "stripe",
  vendor: "Stripe",
  category: "payments",
  mcp_server: "@stripe/agent-toolkit",
  transport: "stdio",
  capabilities: [
    "payment.charge",
    "payment.refund",
    "payment.list",
    "customer.create",
    "customer.list",
    "subscription.create",
    "subscription.list",
    "invoice.create",
    "invoice.list",
    "payment_link.create",
  ],
  required_env: ["STRIPE_API_KEY"],
  owner_consent_required: [
    "payment.charge",
    "payment.refund",
    "subscription.create",
    "invoice.create",
    "payment_link.create",
  ],
  tenant_config_template: {
    mode: "live",
    default_currency: "USD",
    webhook_secret_env: "STRIPE_WEBHOOK_SECRET",
  },
  docs_url: "https://stripe.com/docs/api",
  sample_procedure: "procedures/templates/payments/collect-deposit.yaml",
  registry_status: "official",
};
