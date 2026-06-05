/**
 * find-api-skill.ts — Tier-2 discovery: check whether @penelope/adapters or
 * @penelope/connectors already ships a hand-coded api-skill for this service.
 *
 * The check is purely filesystem/import-based so it works without network
 * access.  The adapter packages are resolved relative to this package's
 * node_modules, or via the PENELOPE_ADAPTERS_PATH env override.
 *
 * Integration note: this depends on @penelope/connectors (5-tier architecture
 * being built in parallel on branch v0.2/connector-tiers).  When that package
 * isn't merged yet, the resolver gracefully returns null with an evidence entry
 * noting the placeholder.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type {
  DiscoveryRequest,
  DiscoveryResult,
  ApiSkillConnectorSpec,
  Evidence,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function normalise(service: string): string {
  return service.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Candidate adapter package directories to scan.
 * `PENELOPE_ADAPTERS_PATH` env var overrides the default resolution so tests
 * can inject a fixture directory without touching node_modules.
 */
function adapterRoots(): string[] {
  const envOverride = process.env["PENELOPE_ADAPTERS_PATH"];
  if (envOverride) return envOverride.split(",").map((p) => resolve(p));

  // Walk up from this package toward workspace root then into sibling packages
  const workspaceRoot = resolve(__dirname, "..", "..", "..");
  return [
    join(workspaceRoot, "packages", "adapters", "src"),
    join(workspaceRoot, "packages", "connectors", "src"),
    // Installed node_modules paths (when consumed as a published package)
    join(__dirname, "..", "node_modules", "@penelope", "adapters", "dist"),
    join(__dirname, "..", "node_modules", "@penelope", "connectors", "dist"),
  ];
}

/**
 * Try to find a skill file whose name resembles the service name inside a root.
 */
async function scanRoot(
  root: string,
  slug: string
): Promise<{ filePath: string; exportSymbol: string } | null> {
  if (!existsSync(root)) return null;

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const base = entry.replace(/\.[jt]s$/, "").toLowerCase();
    if (base.includes(slug) || slug.includes(base)) {
      const filePath = join(root, entry);
      // Derive a plausible export symbol: "toast-pos.ts" → "toastPosSkill"
      const parts = base.split(/[-_]+/).filter(Boolean);
      const camel = parts
        .map((p, i) => (i === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
        .join("");
      return { filePath, exportSymbol: `${camel}Skill` };
    }
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findApiSkill(
  req: DiscoveryRequest
): Promise<DiscoveryResult | null> {
  const evidence: Evidence[] = [];
  const slug = normalise(req.service);
  const roots = adapterRoots();

  // Check whether the connector-tiers package itself exists yet
  const connectorsPackageExists = roots.some(
    (r) => r.includes("connectors") && existsSync(r)
  );

  if (!connectorsPackageExists) {
    evidence.push({
      tier: 2,
      source: "@penelope/connectors",
      query: req.service,
      outcome: "miss",
      detail:
        "@penelope/connectors not yet merged (branch v0.2/connector-tiers). " +
        "Placeholder — tier-2 will become available once that branch lands.",
      at: now(),
    });
  }

  for (const root of roots) {
    const label = root.includes("connectors") ? "@penelope/connectors" : "@penelope/adapters";
    const hit = await scanRoot(root, slug);

    evidence.push({
      tier: 2,
      source: label,
      query: req.service,
      outcome: hit ? "hit" : "miss",
      detail: hit ? `Found: ${hit.filePath}` : `Not found in ${root}`,
      at: now(),
    });

    if (hit) {
      // Infer required env vars by reading file contents if available
      const requiredEnv: string[] = [];
      try {
        const { readFileSync } = await import("node:fs");
        const content = readFileSync(hit.filePath, "utf-8");
        const envMatches = content.match(/process\.env\[?['"]([\w_]+)['"]\]?/g) ?? [];
        for (const m of envMatches) {
          const key = m.replace(/.*['"]([\w_]+)['"].*/, "$1");
          if (!requiredEnv.includes(key)) requiredEnv.push(key);
        }
      } catch {
        // Fine — env extraction is best-effort
      }

      const spec: ApiSkillConnectorSpec = {
        kind: "api-skill",
        packagePath: hit.filePath,
        exportedSymbol: hit.exportSymbol,
        requiredEnv,
      };

      return { tier: 2, connector_spec: spec, confidence: 0.95, evidence };
    }
  }

  return null;
}
