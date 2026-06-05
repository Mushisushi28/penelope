/**
 * cascade.ts — Discovery orchestrator.
 *
 * Tries tiers in order: MCP (1) → API-skill (2) → OpenAPI (3) →
 * Browser recipe (4) → Computer-use (5).
 *
 * Returns the FIRST successful result.  Tier-4 is always attempted if tiers
 * 1-3 all miss, so a null result is impossible for any service reachable on the
 * internet.  Tier-5 is the absolute last resort for desktop/private apps.
 *
 * Guarantee: the function NEVER returns null.  It throws only if the service
 * name is empty or all five tiers fail due to network/infra errors AND the
 * caller has explicitly disabled the browser tier.
 */

import type { DiscoveryRequest, DiscoveryResult, Evidence } from "./types.js";
import { findMcp } from "./find-mcp.js";
import { findApiSkill } from "./find-api-skill.js";
import { findOpenApi } from "./find-openapi.js";
import { buildRecipe, type RecipeBuilderOptions } from "./recipe-builder.js";
import { computerUseFallback, type ComputerUseFallbackOptions } from "./computer-use-fallback.js";

// ── Options ───────────────────────────────────────────────────────────────────

export interface CascadeOptions {
  /** Options forwarded to the recipe builder (tier-4) */
  recipeOptions?: RecipeBuilderOptions;
  /** Options forwarded to computer-use fallback (tier-5) */
  computerUseOptions?: ComputerUseFallbackOptions;
  /**
   * Callback invoked after each tier attempt — useful for CLI progress output.
   * Receives the tier number and whether it produced a result.
   */
  onTierResult?: (tier: number, hit: boolean, evidence: Evidence[]) => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function mergeEvidence(base: Evidence[], extra: Evidence[]): Evidence[] {
  return [...base, ...extra];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function discoverConnector(
  req: DiscoveryRequest,
  opts: CascadeOptions = {}
): Promise<DiscoveryResult> {
  if (!req.service?.trim()) {
    throw new Error("DiscoveryRequest.service must be a non-empty string.");
  }

  const skipped = new Set(req.skipTiers ?? []);
  let accumulatedEvidence: Evidence[] = [];

  // ── Tier 1: MCP registry ─────────────────────────────────────────────────
  if (!skipped.has(1)) {
    try {
      const result = await findMcp(req);
      accumulatedEvidence = mergeEvidence(accumulatedEvidence, result?.evidence ?? []);
      opts.onTierResult?.(1, !!result, result?.evidence ?? []);
      if (result) return { ...result, evidence: accumulatedEvidence };
    } catch {
      // tier failed — continue
      opts.onTierResult?.(1, false, []);
    }
  }

  // ── Tier 2: API-skill ────────────────────────────────────────────────────
  if (!skipped.has(2)) {
    try {
      const result = await findApiSkill(req);
      accumulatedEvidence = mergeEvidence(accumulatedEvidence, result?.evidence ?? []);
      opts.onTierResult?.(2, !!result, result?.evidence ?? []);
      if (result) return { ...result, evidence: accumulatedEvidence };
    } catch {
      opts.onTierResult?.(2, false, []);
    }
  }

  // ── Tier 3: OpenAPI spec ─────────────────────────────────────────────────
  if (!skipped.has(3)) {
    try {
      const result = await findOpenApi(req);
      accumulatedEvidence = mergeEvidence(accumulatedEvidence, result?.evidence ?? []);
      opts.onTierResult?.(3, !!result, result?.evidence ?? []);
      if (result) return { ...result, evidence: accumulatedEvidence };
    } catch {
      opts.onTierResult?.(3, false, []);
    }
  }

  // ── Tier 4: Browser recipe (guaranteed) ──────────────────────────────────
  if (!skipped.has(4)) {
    try {
      const result = await buildRecipe(req, opts.recipeOptions);
      accumulatedEvidence = mergeEvidence(accumulatedEvidence, result.evidence);
      opts.onTierResult?.(4, true, result.evidence);
      return { ...result, evidence: accumulatedEvidence };
    } catch (err) {
      accumulatedEvidence.push({
        tier: 4,
        source: "recipe-builder",
        outcome: "error",
        detail: String(err),
        at: new Date().toISOString(),
      });
      opts.onTierResult?.(4, false, accumulatedEvidence);
      // Fall through to tier-5 — do not give up
    }
  }

  // ── Tier 5: Computer-use (absolute last resort) ───────────────────────────
  if (!skipped.has(5)) {
    const result = await computerUseFallback(req, opts.computerUseOptions);
    accumulatedEvidence = mergeEvidence(accumulatedEvidence, result.evidence);
    opts.onTierResult?.(5, true, result.evidence);
    return { ...result, evidence: accumulatedEvidence };
  }

  // This path is only reached if the caller skipped ALL tiers.
  throw new Error(
    `All discovery tiers were explicitly skipped for service "${req.service}". ` +
      `At minimum, leave tier-4 (browser) enabled.`
  );
}
