/**
 * @penelope/connectors — public API
 */

export type {
  Tier,
  Category,
  Capability,
  TenantConfig,
  Connector,
  ConnectorDescriptor,
} from "./types.js";

export {
  register,
  get,
  getDescriptor,
  byCategory,
  byTier,
  all,
  persist,
  load,
  clear,
} from "./registry.js";

export { McpConnector } from "./tier-mcp.js";
export type { McpConfig, McpStdioConfig, McpSseConfig, McpTransport } from "./tier-mcp.js";

export { ApiSkillConnector } from "./tier-api-skill.js";

export { HermesConnector } from "./tier-hermes.js";
export type { HermesOperation, HermesSpecConfig } from "./tier-hermes.js";

export { BrowserConnector } from "./tier-browser.js";
export type { BrowserRecipe, BrowserTenantConfig, RecipeStep } from "./tier-browser.js";

export { ComputerUseConnector } from "./tier-computer-use.js";
export type { ComputerUseGoal } from "./tier-computer-use.js";

export {
  evaluatePromotions,
  registerOpenApiSpec,
  registerApiSkillAvailable,
  registerMcpAvailable,
} from "./auto-promote.js";
export type { UsageSample, PromotionSuggestion } from "./auto-promote.js";

export { seedConnectors } from "./seed-connectors.js";
