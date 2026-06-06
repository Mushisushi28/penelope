import type { MCPConnectorDescriptor } from "../types.js";

export const clickupConnector: MCPConnectorDescriptor = {
  id: "clickup",
  vendor: "ClickUp",
  category: "project-mgmt",
  mcp_server: "TODO:clickup-mcp",
  transport: "sse",
  capabilities: [
    "task.create",
    "task.update",
    "task.list",
    "task.complete",
    "task.assign",
    "list.create",
    "list.list",
    "space.list",
    "comment.add",
    "time_tracking.start",
    "time_tracking.stop",
  ],
  required_env: ["CLICKUP_API_TOKEN"],
  owner_consent_required: [
    "task.create",
    "task.assign",
    "time_tracking.start",
  ],
  tenant_config_template: {
    workspace_id: "",
    default_list_id: "",
    default_assignee_id: "",
  },
  docs_url: "https://clickup.com/api/",
  sample_procedure: "procedures/templates/project-mgmt/create-task-from-lead.yaml",
  registry_status: "beta",
};
