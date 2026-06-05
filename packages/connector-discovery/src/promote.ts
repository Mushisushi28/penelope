/**
 * promote.ts — Opportunistic tier upgrade suggestions.
 *
 * After a tier-4 browser recipe has run reliably for a configurable number of
 * days (default: 10) and a higher-tier integration becomes available (e.g. an
 * OpenAPI spec is found), this module generates a PromoteCandidate suggestion
 * for the owner to approve.
 *
 * Promotion is purely advisory — it NEVER auto-applies.  The returned
 * PromoteCandidate is surfaced to the owner (via email or Telegram) and applied
 * only after explicit approval.
 *
 * Promotion path priorities (highest first):
 *   tier-4 → tier-1  (MCP server becomes available)
 *   tier-4 → tier-2  (api-skill added to @penelope/adapters)
 *   tier-4 → tier-3  (OpenAPI spec discovered)
 */

import type {
  DiscoveryRequest,
  DiscoveryResult,
  PromoteCandidate,
  Recipe,
} from "./types.js";
import { findMcp } from "./find-mcp.js";
import { findApiSkill } from "./find-api-skill.js";
import { findOpenApi } from "./find-openapi.js";

// ── Reliability store interface ───────────────────────────────────────────────

export interface ReliabilityRecord {
  service: string;
  currentTier: 4 | 5;
  recipe: Recipe;
  firstSuccessAt: string;
  lastSuccessAt: string;
  successCount: number;
  failureCount: number;
  owner_email: string;
}

export interface ReliabilityStore {
  get(service: string): Promise<ReliabilityRecord | null>;
  upsert(record: ReliabilityRecord): Promise<void>;
}

/** In-memory store used in tests and as a fallback */
export class InMemoryReliabilityStore implements ReliabilityStore {
  private store = new Map<string, ReliabilityRecord>();

  async get(service: string): Promise<ReliabilityRecord | null> {
    return this.store.get(service) ?? null;
  }

  async upsert(record: ReliabilityRecord): Promise<void> {
    this.store.set(record.service, record);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

// ── Main exports ──────────────────────────────────────────────────────────────

/** Minimum consecutive days of reliable operation before a promote suggestion fires */
export const PROMOTE_RELIABILITY_THRESHOLD_DAYS = 10;

/**
 * Record a successful recipe run.  Call this from the connector runtime after
 * each successful tier-4 / tier-5 replay.
 */
export async function recordSuccess(
  service: string,
  recipe: Recipe,
  owner_email: string,
  store: ReliabilityStore
): Promise<void> {
  const existing = await store.get(service);
  const now = new Date().toISOString();

  if (existing) {
    await store.upsert({
      ...existing,
      lastSuccessAt: now,
      successCount: existing.successCount + 1,
    });
  } else {
    await store.upsert({
      service,
      currentTier: 4,
      recipe,
      firstSuccessAt: now,
      lastSuccessAt: now,
      successCount: 1,
      failureCount: 0,
      owner_email,
    });
  }
}

/**
 * Check whether a service is eligible for a tier upgrade and — if so — return
 * a PromoteCandidate.  Returns null if:
 *   - not enough reliable days have elapsed
 *   - no better tier is available
 */
export async function checkPromoteEligibility(
  service: string,
  store: ReliabilityStore,
  thresholdDays = PROMOTE_RELIABILITY_THRESHOLD_DAYS
): Promise<PromoteCandidate | null> {
  const record = await store.get(service);
  if (!record) return null;

  const daysReliable = daysBetween(record.firstSuccessAt, record.lastSuccessAt);
  if (daysReliable < thresholdDays) return null;

  // Build a minimal DiscoveryRequest to probe higher tiers
  const req: DiscoveryRequest = {
    service,
    capabilities: ["login", "list-items"],
    owner_email: record.owner_email,
  };

  // Try tiers 1 → 3 in order of preference
  for (const finder of [findMcp, findApiSkill, findOpenApi]) {
    try {
      const result = await finder(req);
      if (result && result.tier < record.currentTier) {
        return {
          service,
          currentTier: record.currentTier,
          targetTier: result.tier,
          recipe: record.recipe,
          daysReliable: Math.floor(daysReliable),
          proposedSpec: result.connector_spec,
          owner_email: record.owner_email,
        };
      }
    } catch {
      // Tier check failed — try next
    }
  }

  return null;
}

/**
 * Format a PromoteCandidate into a human-readable notification message.
 * Intended for Telegram / email delivery.
 */
export function formatPromoteSuggestion(candidate: PromoteCandidate): string {
  const tierName: Record<number, string> = {
    1: "MCP server (tier-1)",
    2: "hand-coded API skill (tier-2)",
    3: "OpenAPI spec integration (tier-3)",
  };

  const to = tierName[candidate.targetTier] ?? `tier-${candidate.targetTier}`;

  return (
    `Penelope connector upgrade available for ${candidate.service}.\n\n` +
    `The browser recipe has run reliably for ${candidate.daysReliable} days.\n` +
    `A ${to} integration is now available — this will be faster and more reliable.\n\n` +
    `To approve: penelope connector promote ${candidate.service}\n` +
    `To ignore: no action needed.`
  );
}
