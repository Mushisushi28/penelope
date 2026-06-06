import type { MCPConnectorDescriptor } from "../types.js";

export const linearConnector: MCPConnectorDescriptor = {
  id: "linear",
  vendor: "Linear",
  category: "project-mgmt",
  mcp_server: "linear-mcp",
  transport: "stdio",
  capabilities: [
    "issue.create",
    "issue.update",
    "issue.list",
    "issue.assign",
    "issue.complete",
    "project.list",
    "team.list",
    "cycle.list",
    "comment.add",
    "label.assign",
  ],
  required_env: ["LINEAR_API_KEY"],
  owner_consent_required: [
    "issue.create",
    "issue.assign",
  ],
  tenant_config_template: {
    team_id: "",
    default_project_id: "",
    default_assignee_id: "",
  },
  docs_url: "https://developers.linear.app/docs",
  sample_procedure: "procedures/templates/project-mgmt/create-task-from-lead.yaml",
  registry_status: "community",
};
