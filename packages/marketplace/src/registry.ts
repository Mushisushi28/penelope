/**
 * @penelope/marketplace — registry
 * Merges local seed items with remote read-only index.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketplaceManifest, MarketplaceItem, RemoteIndex } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Public read-only registry hosted on penelope-marketplace repo */
const REMOTE_INDEX_URL =
  "https://raw.githubusercontent.com/Mushisushi28/penelope-marketplace/main/index.json";

/** Local seed directory (bundled with this package) */
const SEED_DIR = join(__dirname, "..", "seed");

// ---------------------------------------------------------------------------
// Local seed loader
// ---------------------------------------------------------------------------

async function loadSeedItems(): Promise<MarketplaceManifest[]> {
  let entries: string[];
  try {
    entries = await readdir(SEED_DIR);
  } catch {
    return [];
  }

  const manifests: MarketplaceManifest[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".json")) continue;
    const raw = await readFile(join(SEED_DIR, entry), "utf8");
    // For YAML seeds we store the manifest header as a JSON comment block.
    // Seed files embed a `##MANIFEST##` section at the top:
    //   ##MANIFEST## { ... }
    const match = raw.match(/##MANIFEST##\s*(\{[\s\S]*?\})\s*##END##/);
    if (match?.[1]) {
      try {
        manifests.push(JSON.parse(match[1]) as MarketplaceManifest);
      } catch {
        // malformed — skip
      }
    }
  }
  return manifests;
}

// ---------------------------------------------------------------------------
// Remote index fetcher (read-only, gracefully degrades)
// ---------------------------------------------------------------------------

async function fetchRemoteIndex(): Promise<MarketplaceManifest[]> {
  try {
    const res = await fetch(REMOTE_INDEX_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as RemoteIndex;
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    // Remote unavailable — offline mode is fine
    return [];
  }
}

// ---------------------------------------------------------------------------
// Merged registry
// ---------------------------------------------------------------------------

export interface RegistryOptions {
  /** Skip remote fetch (offline / test mode) */
  offline?: boolean;
}

export async function loadRegistry(opts: RegistryOptions = {}): Promise<MarketplaceManifest[]> {
  const [local, remote] = await Promise.all([
    loadSeedItems(),
    opts.offline ? Promise.resolve([]) : fetchRemoteIndex(),
  ]);

  // Deduplicate: remote wins on same id+version, local seed wins otherwise
  const map = new Map<string, MarketplaceManifest>();
  for (const item of [...local, ...remote]) {
    const key = `${item.id}@${item.version}`;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getItem(
  id: string,
  opts: RegistryOptions = {}
): Promise<MarketplaceManifest | undefined> {
  const all = await loadRegistry(opts);
  return all.find((x) => x.id === id);
}
