import type { MCPConnectorDescriptor } from "../types.js";

export const gustoConnector: MCPConnectorDescriptor = {
  id: "gusto",
  vendor: "Gusto",
  category: "payroll",
  mcp_server: "TODO:gusto-mcp",
  transport: "stdio",
  capabilities: [
    "employee.list",
    "employee.create",
    "employee.update",
    "payroll.run",
    "payroll.list",
    "pay_stub.get",
    "contractor.list",
    "contractor.payment",
    "benefit.list",
    "time_off.list",
  ],
  required_env: ["GUSTO_CLIENT_ID", "GUSTO_CLIENT_SECRET", "GUSTO_COMPANY_ID"],
  owner_consent_required: [
    "payroll.run",
    "contractor.payment",
    "employee.create",
    "employee.update",
  ],
  tenant_config_template: {
    company_id: "",
    pay_schedule_id: "",
    default_department_id: "",
  },
  docs_url: "https://docs.gusto.com/app-integrations/docs",
  sample_procedure: "procedures/templates/payroll/run-payroll.yaml",
  registry_status: "TODO",
};
