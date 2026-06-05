/**
 * find-mcp.ts — Tier-1 discovery: search known MCP registries for a matching server.
 *
 * Sources queried (in order):
 *   1. npm registry — `@modelcontextprotocol/<slug>` + community search
 *   2. Glama.ai MCP index  (https://glama.ai/mcp/servers)
 *   3. MCPHub.com registry (https://mcphub.com/api/search)
 *
 * Returns the first credible hit as a tier-1 DiscoveryResult, or null if none
 * found.  Callers (cascade.ts) treat null as "move to tier-2".
 */

import type {
  DiscoveryRequest,
  DiscoveryResult,
  McpConnectorSpec,
  Evidence,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/** Normalise a service name into likely npm slug forms */
function slugsFor(service: string): string[] {
  const base = service
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [
    `@modelcontextprotocol/${base}`,
    `mcp-${base}`,
    `${base}-mcp`,
    `@mcp/${base}`,
  ];
}

interface NpmPackageHit {
  name: string;
  version: string;
  description?: string;
}

/**
 * Query the npm registry search endpoint.
 * Docs: https://registry.npmjs.org/-/v1/search
 */
async function searchNpm(service: string): Promise<NpmPackageHit | null> {
  const query = encodeURIComponent(`mcp ${service}`);
  const url = `https://registry.npmjs.org/-/v1/search?text=${query}&size=5`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "penelope-connector-discovery/0.2" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const objects = (json as { objects?: Array<{ package: { name: string; version: string; description?: string } }> })
    ?.objects ?? [];

  const slug = service.toLowerCase();

  for (const obj of objects) {
    const pkg = obj.package;
    if (!pkg?.name) continue;

    // Accept if the package name strongly relates to both "mcp" and the service
    const nameLower = pkg.name.toLowerCase();
    if (
      (nameLower.includes("mcp") || nameLower.startsWith("@modelcontextprotocol")) &&
      (nameLower.includes(slug.replace(/\s+/g, "-")) ||
        nameLower.includes(slug.replace(/\s+/g, "")))
    ) {
      return { name: pkg.name, version: pkg.version, description: pkg.description };
    }
  }

  return null;
}

/**
 * Query Glama.ai MCP index.
 * The public search endpoint returns JSON with a `servers` array.
 */
async function searchGlama(service: string): Promise<{ name: string; packageName: string; url: string } | null> {
  const q = encodeURIComponent(service);
  const url = `https://glama.ai/api/mcp/v1/servers?query=${q}&limit=5`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "penelope-connector-discovery/0.2" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const servers = (json as { servers?: Array<{ name: string; packageName?: string; url?: string }> })
    ?.servers ?? [];

  if (servers.length === 0) return null;

  const first = servers[0];
  if (!first) return null;
  return {
    name: first.name ?? "unknown",
    packageName: first.packageName ?? `mcp-${service.toLowerCase()}`,
    url: first.url ?? url,
  };
}

/**
 * Query MCPHub.com search API.
 */
async function searchMcpHub(service: string): Promise<{ name: string; package: string } | null> {
  const q = encodeURIComponent(service);
  const url = `https://mcphub.com/api/search?q=${q}&limit=5`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "penelope-connector-discovery/0.2" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const results = (json as { results?: Array<{ name: string; package?: string }> })
    ?.results ?? [];

  if (results.length === 0) return null;
  const first = results[0];
  if (!first) return null;
  return { name: first.name ?? "unknown", package: first.package ?? `mcp-${service.toLowerCase()}` };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findMcp(
  req: DiscoveryRequest
): Promise<DiscoveryResult | null> {
  const evidence: Evidence[] = [];

  // ── 1. npm ────────────────────────────────────────────────────────────────
  const npmHit = await searchNpm(req.service);
  evidence.push({
    tier: 1,
    source: "npm-registry",
    query: `mcp ${req.service}`,
    outcome: npmHit ? "hit" : "miss",
    detail: npmHit ? `Found: ${npmHit.name}@${npmHit.version}` : "No matching package",
    at: now(),
  });

  if (npmHit) {
    const spec: McpConnectorSpec = {
      kind: "mcp",
      packageName: npmHit.name,
      version: npmHit.version,
      registryUrl: `https://www.npmjs.com/package/${npmHit.name}`,
      installCommand: `npx ${npmHit.name}`,
    };
    return { tier: 1, connector_spec: spec, confidence: 0.85, evidence };
  }

  // ── 2. Glama.ai ──────────────────────────────────────────────────────────
  const glamaHit = await searchGlama(req.service);
  evidence.push({
    tier: 1,
    source: "glama.ai",
    query: req.service,
    outcome: glamaHit ? "hit" : "miss",
    detail: glamaHit ? `Found: ${glamaHit.name} (${glamaHit.packageName})` : "No result",
    at: now(),
  });

  if (glamaHit) {
    const spec: McpConnectorSpec = {
      kind: "mcp",
      packageName: glamaHit.packageName,
      version: "latest",
      registryUrl: glamaHit.url,
      installCommand: `npx ${glamaHit.packageName}`,
    };
    return { tier: 1, connector_spec: spec, confidence: 0.75, evidence };
  }

  // ── 3. MCPHub ─────────────────────────────────────────────────────────────
  const hubHit = await searchMcpHub(req.service);
  evidence.push({
    tier: 1,
    source: "mcphub.com",
    query: req.service,
    outcome: hubHit ? "hit" : "miss",
    detail: hubHit ? `Found: ${hubHit.name} (${hubHit.package})` : "No result",
    at: now(),
  });

  if (hubHit) {
    const spec: McpConnectorSpec = {
      kind: "mcp",
      packageName: hubHit.package,
      version: "latest",
      registryUrl: `https://mcphub.com/server/${hubHit.name}`,
      installCommand: `npx ${hubHit.package}`,
    };
    return { tier: 1, connector_spec: spec, confidence: 0.70, evidence };
  }

  return null;
}

/** Exported for tests */
export { slugsFor };
