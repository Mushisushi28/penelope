import type { MCPConnectorDescriptor } from "../types.js";

export const asanaConnector: MCPConnectorDescriptor = {
  id: "asana",
  vendor: "Asana",
  category: "project-mgmt",
  mcp_server: "asana-mcp",
  transport: "sse",
  capabilities: [
    "task.create",
    "task.update",
    "task.list",
    "task.complete",
    "task.assign",
    "project.create",
    "project.list",
    "project.update",
    "comment.add",
    "subtask.create",
    "tag.assign",
  ],
  required_env: ["ASANA_ACCESS_TOKEN"],
  owner_consent_required: [
    "task.create",
    "task.assign",
    "project.create",
  ],
  tenant_config_template: {
    workspace_gid: "",
    default_project_gid: "",
    default_assignee_gid: "",
  },
  docs_url: "https://developers.asana.com/reference/rest-api-reference",
  sample_procedure: "procedures/templates/project-mgmt/create-task-from-lead.yaml",
  registry_status: "official",
};
