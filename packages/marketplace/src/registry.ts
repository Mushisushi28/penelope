/**
 * @penelope/marketplace — registry
 * Merges local seed items with remote read-only index.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketplaceManifest, RemoteIndex } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTE_INDEX_URL =
  "https://raw.githubusercontent.com/Mushisushi28/penelope-marketplace/main/index.json";

const SEED_DIR = join(__dirname, "..", "seed");

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

async function fetchRemoteIndex(): Promise<MarketplaceManifest[]> {
  try {
    const res = await fetch(REMOTE_INDEX_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as RemoteIndex;
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

export interface RegistryOptions {
  offline?: boolean;
}

export async function loadRegistry(opts: RegistryOptions = {}): Promise<MarketplaceManifest[]> {
  const [local, remote] = await Promise.all([
    loadSeedItems(),
    opts.offline ? Promise.resolve([]) : fetchRemoteIndex(),
  ]);

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
