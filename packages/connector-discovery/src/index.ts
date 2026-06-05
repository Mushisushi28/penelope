/**
 * @penelope/connector-discovery
 *
 * Public API surface.
 */

export type {
  DiscoveryRequest,
  DiscoveryResult,
  DiscoveryTier,
  CapabilityKind,
  ConnectorSpec,
  McpConnectorSpec,
  ApiSkillConnectorSpec,
  OpenApiConnectorSpec,
  RecipeConnectorSpec,
  ComputerUseConnectorSpec,
  Recipe,
  RecipeStep,
  ComputerUseAction,
  Evidence,
  PromoteCandidate,
} from "./types.js";

export { discoverConnector } from "./cascade.js";
export type { CascadeOptions } from "./cascade.js";

export { buildRecipe } from "./recipe-builder.js";
export type { BrowserClient, DomElement, RecipeBuilderOptions } from "./recipe-builder.js";

export { computerUseFallback } from "./computer-use-fallback.js";
export type { ComputerUseClient, ComputerUseSession, ComputerUseFallbackOptions } from "./computer-use-fallback.js";

export { findMcp } from "./find-mcp.js";
export { findApiSkill } from "./find-api-skill.js";
export { findOpenApi } from "./find-openapi.js";

export {
  recordSuccess,
  checkPromoteEligibility,
  formatPromoteSuggestion,
  InMemoryReliabilityStore,
  PROMOTE_RELIABILITY_THRESHOLD_DAYS,
} from "./promote.js";
export type { ReliabilityRecord, ReliabilityStore } from "./promote.js";

export { makeConnectorDiscoverCommand, main } from "./cli.js";
