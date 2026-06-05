/**
 * @penelope/connectors — global connector registry
 *
 * In-memory map with optional JSON persistence to state/connectors.json.
 * Both full Connector instances and lightweight ConnectorDescriptors can
 * be registered; the registry stores the descriptor metadata in JSON and
 * keeps live connector instances in the in-memory map.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connector, ConnectorDescriptor, Category, Tier } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "..", "state", "connectors.json");

// ─── In-memory store ───────────────────────────────────────────────────────────

const liveConnectors = new Map<string, Connector>();
const descriptors = new Map<string, ConnectorDescriptor>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toDescriptor(c: Connector | ConnectorDescriptor): ConnectorDescriptor {
  return {
    id: c.id,
    displayName: c.displayName,
    description: c.description,
    tier: c.tier,
    category: c.category,
    capabilities: c.capabilities,
    implementationStatus: "invoke" in c ? "full" : (c as ConnectorDescriptor).implementationStatus,
  };
}

function isConnector(c: Connector | ConnectorDescriptor): c is Connector {
  return typeof (c as Connector).invoke === "function";
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a full Connector or a metadata-only ConnectorDescriptor.
 * Full connectors are accessible via `get(id)`.
 * Both types are persisted to state/connectors.json.
 */
export function register(connector: Connector | ConnectorDescriptor): void {
  const desc = toDescriptor(connector);
  descriptors.set(desc.id, desc);
  if (isConnector(connector)) {
    liveConnectors.set(connector.id, connector);
  }
}

/**
 * Retrieve a fully-initialised Connector by id.
 * Returns `undefined` for stubs or unknown ids.
 */
export function get(id: string): Connector | undefined {
  return liveConnectors.get(id);
}

/**
 * Retrieve the descriptor (metadata) for any registered connector/stub.
 */
export function getDescriptor(id: string): ConnectorDescriptor | undefined {
  return descriptors.get(id);
}

/**
 * List all descriptors for a given functional category.
 */
export function byCategory(cat: Category): ConnectorDescriptor[] {
  return [...descriptors.values()].filter((d) => d.category === cat);
}

/**
 * List all descriptors for a given tier.
 */
export function byTier(tier: Tier): ConnectorDescriptor[] {
  return [...descriptors.values()].filter((d) => d.tier === tier);
}

/**
 * List every registered descriptor.
 */
export function all(): ConnectorDescriptor[] {
  return [...descriptors.values()];
}

/**
 * Persist current descriptors to state/connectors.json.
 * Creates the state/ directory if it doesn't exist.
 */
export async function persist(): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const payload = JSON.stringify([...descriptors.values()], null, 2);
  await writeFile(STATE_PATH, payload, "utf8");
}

/**
 * Load descriptors from state/connectors.json (silently no-ops if file absent).
 * Does NOT restore live Connector instances — only metadata.
 */
export async function load(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(STATE_PATH, "utf8");
  } catch {
    return;
  }

  let items: ConnectorDescriptor[];
  try {
    items = JSON.parse(raw) as ConnectorDescriptor[];
  } catch {
    return;
  }

  for (const item of items) {
    if (!descriptors.has(item.id)) {
      descriptors.set(item.id, item);
    }
  }
}

/** Clear all registrations (useful in tests). */
export function clear(): void {
  liveConnectors.clear();
  descriptors.clear();
}
