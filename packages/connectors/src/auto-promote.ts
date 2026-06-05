/**
 * @penelope/connectors — Tier upgrade suggestion engine
 *
 * Monitors usage data and suggests tier promotions when a better integration
 * path becomes available.  All promotions require owner approval before taking
 * effect.
 *
 * Current ruleset:
 *   - Connector is on tier 5 (computer-use) and is called frequently
 *     AND an OpenAPI spec URL is registered → suggest tier 3 (hermes-openapi)
 *   - Connector is on tier 4 (browser) and an API skill exists in the catalog
 *     → suggest tier 2 (api-skill)
 *   - Connector is on tier 3 (hermes-openapi) and an MCP server is registered
 *     → suggest tier 1 (mcp)
 */

import type { ConnectorDescriptor, Tier } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageSample {
  /** Connector id. */
  connectorId: string;
  /** Cumulative invocation count for the reporting window. */
  invocations: number;
  /** Window duration in milliseconds (e.g. 7 * 24 * 60 * 60 * 1000 for 7d). */
  windowMs: number;
}

export interface PromotionSuggestion {
  connectorId: string;
  currentTier: Tier;
  suggestedTier: Tier;
  reason: string;
  /** True once owner has approved — never mutated here; caller sets it. */
  approved: boolean;
  createdAt: string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Minimum weekly invocations to trigger a promotion suggestion. */
const MIN_WEEKLY_INVOCATIONS = 10;

/** Minimum invocations per day to consider "frequent". */
const MIN_DAILY_RATE = 1;

// ─── Available upgrade hints ──────────────────────────────────────────────────

/**
 * Registry of known OpenAPI spec URLs keyed by connector id.
 * Populated by seed-connectors.ts for well-known services.
 */
const knownOpenApiSpecs = new Map<string, string>();

/** Connectors that have a hand-coded API skill available. */
const knownApiSkills = new Set<string>();

/** Connectors that have an MCP server available. */
const knownMcpServers = new Set<string>();

export function registerOpenApiSpec(connectorId: string, specUrl: string): void {
  knownOpenApiSpecs.set(connectorId, specUrl);
}

export function registerApiSkillAvailable(connectorId: string): void {
  knownApiSkills.add(connectorId);
}

export function registerMcpAvailable(connectorId: string): void {
  knownMcpServers.add(connectorId);
}

// ─── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate current usage samples against known upgrade paths.
 * Returns a list of (unapproved) promotion suggestions.
 * Never mutates the registry or connector state.
 */
export function evaluatePromotions(
  descriptors: ConnectorDescriptor[],
  samples: UsageSample[]
): PromotionSuggestion[] {
  const sampleMap = new Map(samples.map((s) => [s.connectorId, s]));
  const suggestions: PromotionSuggestion[] = [];

  for (const desc of descriptors) {
    const sample = sampleMap.get(desc.id);
    if (!sample) continue;

    const isFrequent = isFrequentUsage(sample);

    if (desc.tier === "computer-use" && isFrequent) {
      if (knownOpenApiSpecs.has(desc.id)) {
        suggestions.push({
          connectorId: desc.id,
          currentTier: "computer-use",
          suggestedTier: "hermes-openapi",
          reason: `"${desc.displayName}" is used ${sample.invocations}× in the last period and an OpenAPI spec is now registered. Tier 3 (hermes-openapi) would reduce cost and improve reliability.`,
          approved: false,
          createdAt: new Date().toISOString(),
        });
      } else if (knownApiSkills.has(desc.id)) {
        suggestions.push({
          connectorId: desc.id,
          currentTier: "computer-use",
          suggestedTier: "api-skill",
          reason: `"${desc.displayName}" has a hand-coded API skill available. Tier 2 (api-skill) would replace computer-use at far lower cost.`,
          approved: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (desc.tier === "browser" && isFrequent) {
      if (knownApiSkills.has(desc.id)) {
        suggestions.push({
          connectorId: desc.id,
          currentTier: "browser",
          suggestedTier: "api-skill",
          reason: `"${desc.displayName}" is called ${sample.invocations}× and an API skill is now available. Browser automation can be retired.`,
          approved: false,
          createdAt: new Date().toISOString(),
        });
      } else if (knownOpenApiSpecs.has(desc.id)) {
        suggestions.push({
          connectorId: desc.id,
          currentTier: "browser",
          suggestedTier: "hermes-openapi",
          reason: `"${desc.displayName}" now has an OpenAPI spec. Tier 3 (hermes-openapi) is more reliable than browser automation.`,
          approved: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (desc.tier === "hermes-openapi" && isFrequent) {
      if (knownMcpServers.has(desc.id)) {
        suggestions.push({
          connectorId: desc.id,
          currentTier: "hermes-openapi",
          suggestedTier: "mcp",
          reason: `"${desc.displayName}" has an MCP server available. Tier 1 (mcp) provides richer capabilities and better tool definitions.`,
          approved: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return suggestions;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFrequentUsage(sample: UsageSample): boolean {
  const days = sample.windowMs / (24 * 60 * 60 * 1000);
  const dailyRate = sample.invocations / (days || 1);
  return (
    sample.invocations >= MIN_WEEKLY_INVOCATIONS && dailyRate >= MIN_DAILY_RATE
  );
}
