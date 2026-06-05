/**
 * find-openapi.ts — Tier-3 discovery: probe common OpenAPI spec URL patterns
 * and GitHub code search for an OpenAPI spec belonging to the service.
 *
 * URL probe order per service base URL:
 *   /openapi.json   /openapi.yaml
 *   /api/openapi.json   /api/openapi.yaml
 *   /v1/openapi.json    /v2/openapi.json
 *   /swagger.json       /swagger.yaml
 *   docs.<base>/openapi.json (sub-domain variant)
 *   api.<base>/openapi.json
 *
 * If a spec is found and @penelope/hermes is available, it registers the spec
 * via hermes (placeholder contract documented below).
 *
 * Integration note: @penelope/hermes registration is called via a dynamic
 * import so this file compiles even when hermes isn't present yet.
 */

import type {
  DiscoveryRequest,
  DiscoveryResult,
  OpenApiConnectorSpec,
  Evidence,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function baseUrlFor(service: string, override?: string): string {
  if (override) {
    const u = override.replace(/\/$/, "");
    return u.startsWith("http") ? u : `https://${u}`;
  }
  const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `https://${slug}.com`;
}

function specsToProbe(base: string): string[] {
  const u = base.replace(/\/$/, "");
  // Parse hostname for subdomain variants
  let hostname: string;
  try {
    hostname = new URL(u).hostname;
  } catch {
    hostname = u.replace(/^https?:\/\//, "");
  }
  const root = hostname.replace(/^(www|api|docs)\./, "");

  return [
    `${u}/openapi.json`,
    `${u}/openapi.yaml`,
    `${u}/openapi.yml`,
    `${u}/api/openapi.json`,
    `${u}/api/openapi.yaml`,
    `${u}/v1/openapi.json`,
    `${u}/v2/openapi.json`,
    `${u}/v3/openapi.json`,
    `${u}/swagger.json`,
    `${u}/swagger.yaml`,
    `https://api.${root}/openapi.json`,
    `https://api.${root}/openapi.yaml`,
    `https://docs.${root}/openapi.json`,
    `https://docs.${root}/openapi.yaml`,
    `https://api.${root}/v1/openapi.json`,
    `https://api.${root}/v2/openapi.json`,
  ];
}

interface OpenApiMeta {
  title: string;
  version: string;
  specUrl: string;
}

async function probeUrl(url: string): Promise<OpenApiMeta | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "penelope-connector-discovery/0.2" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json") && !ct.includes("yaml") && !ct.includes("text")) {
      return null;
    }

    // Fetch body to extract title + version
    const body = await (
      await fetch(url, {
        headers: { "User-Agent": "penelope-connector-discovery/0.2" },
        signal: AbortSignal.timeout(8_000),
      })
    ).text();

    // Quick JSON parse attempt
    let title = "Unknown";
    let version = "unknown";
    try {
      const parsed = JSON.parse(body) as {
        info?: { title?: string; version?: string };
        openapi?: string;
        swagger?: string;
      };
      if (parsed?.openapi || parsed?.swagger) {
        title = parsed?.info?.title ?? "Unknown";
        version = parsed?.info?.version ?? "unknown";
        return { title, version, specUrl: url };
      }
    } catch {
      // YAML — look for simple patterns
      const titleMatch = body.match(/^\s*title:\s*['"]?([^'"\\n]+)/m);
      const versionMatch = body.match(/^\s*version:\s*['"]?([^\s'"\\n]+)/m);
      if (body.includes("openapi:") || body.includes("swagger:")) {
        return {
          title: titleMatch?.[1]?.trim() ?? "Unknown",
          version: versionMatch?.[1]?.trim() ?? "unknown",
          specUrl: url,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GitHub code search for `path:openapi.{json,yaml} <service>`.
 * Uses the unauthenticated API (60 req/h per IP — sufficient for discovery).
 */
async function searchGitHub(service: string): Promise<OpenApiMeta | null> {
  const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const query = encodeURIComponent(
    `${slug} path:openapi.json OR path:openapi.yaml OR path:swagger.json`
  );
  const url = `https://api.github.com/search/code?q=${query}&per_page=3`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "penelope-connector-discovery/0.2",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const items = (json as { items?: Array<{ html_url: string; repository?: { full_name: string } }> })
    ?.items ?? [];

  if (items.length === 0) return null;

  const first = items[0];
  if (!first) return null;

  // Convert blob URL to raw content URL
  const rawUrl = first.html_url
    .replace("github.com", "raw.githubusercontent.com")
    .replace("/blob/", "/");

  const meta = await probeUrl(rawUrl);
  return meta;
}

/**
 * Optional hermes registration.  Contract (placeholder until v0.2/connector-tiers merges):
 *   import { registerOpenApiConnector } from "@penelope/hermes";
 *   const id = await registerOpenApiConnector({ specUrl, owner_email });
 */
async function tryRegisterWithHermes(
  specUrl: string,
  owner_email: string
): Promise<string | undefined> {
  try {
    // Dynamic import so we don't hard-fail when hermes isn't installed yet
    const hermes = await import("@penelope/hermes" as string);
    const fn = (hermes as { registerOpenApiConnector?: (opts: { specUrl: string; owner_email: string }) => Promise<string> })
      .registerOpenApiConnector;
    if (typeof fn === "function") {
      return await fn({ specUrl, owner_email });
    }
  } catch {
    // hermes not available — silent
  }
  return undefined;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findOpenApi(
  req: DiscoveryRequest
): Promise<DiscoveryResult | null> {
  const evidence: Evidence[] = [];
  const base = baseUrlFor(req.service, req.baseUrl);
  const urlsToProbe = specsToProbe(base);

  let firstHit: OpenApiMeta | null = null;

  // Probe URL patterns in parallel batches of 4
  for (let i = 0; i < urlsToProbe.length && !firstHit; i += 4) {
    const batch = urlsToProbe.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((u) => probeUrl(u)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j]!;
      const probeUrl_s = batch[j]!;
      if (r.status === "fulfilled" && r.value) {
        firstHit = r.value;
        evidence.push({
          tier: 3,
          source: "url-probe",
          query: probeUrl_s,
          outcome: "hit",
          detail: `Found spec: ${r.value.title} v${r.value.version}`,
          at: now(),
        });
        break;
      } else {
        evidence.push({
          tier: 3,
          source: "url-probe",
          query: probeUrl_s,
          outcome: "miss",
          detail: r.status === "rejected" ? String(r.reason) : "No spec at URL",
          at: now(),
        });
      }
    }
  }

  // GitHub code search as fallback
  if (!firstHit) {
    const ghHit = await searchGitHub(req.service);
    evidence.push({
      tier: 3,
      source: "github-code-search",
      query: req.service,
      outcome: ghHit ? "hit" : "miss",
      detail: ghHit ? `Found via GitHub: ${ghHit.title}` : "No GitHub spec found",
      at: now(),
    });
    if (ghHit) firstHit = ghHit;
  }

  if (!firstHit) return null;

  // Optional hermes registration
  const hermesId = await tryRegisterWithHermes(firstHit.specUrl, req.owner_email);
  if (hermesId) {
    evidence.push({
      tier: 3,
      source: "hermes-registration",
      query: firstHit.specUrl,
      outcome: "hit",
      detail: `Registered with hermes: ${hermesId}`,
      at: now(),
    });
  }

  const spec: OpenApiConnectorSpec = {
    kind: "openapi",
    specUrl: firstHit.specUrl,
    title: firstHit.title,
    version: firstHit.version,
    ...(hermesId ? { hermesRegistrationId: hermesId } : {}),
  };

  return {
    tier: 3,
    connector_spec: spec,
    confidence: hermesId ? 0.90 : 0.80,
    evidence,
  };
}
