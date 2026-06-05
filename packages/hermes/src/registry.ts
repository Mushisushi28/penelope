/**
 * @penelope/hermes — Connector Registry
 *
 * In-memory store + JSON-file persistence.
 * Vendored + simplified from loom/src/hermes/registry.ts (no bus events, no SQLite).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connector } from './types.js';

export class ConnectorRegistry {
  private readonly store = new Map<string, Connector>();
  private readonly stateDir: string | null;

  constructor(stateDir: string | null = null) {
    this.stateDir = stateDir;
    if (stateDir && existsSync(stateDir)) {
      this.loadFromDisk(stateDir);
    }
  }

  /** Add or replace a connector. Persists to disk if stateDir set. */
  add(connector: Connector): Connector {
    this.store.set(connector.id, connector);
    if (this.stateDir) this.saveToDisk(connector);
    return connector;
  }

  /** Load a connector from a JSON file and register it. */
  addFromFile(filePath: string): Connector {
    const raw = readFileSync(filePath, 'utf-8');
    const connector = JSON.parse(raw) as Connector;
    return this.add(connector);
  }

  /** Remove a connector by id. Returns true if it existed. */
  remove(id: string): boolean {
    const existed = this.store.has(id);
    if (existed) this.store.delete(id);
    return existed;
  }

  /** Look up a connector by id. */
  get(id: string): Connector | undefined {
    return this.store.get(id);
  }

  /** List all registered connectors. */
  list(): Connector[] {
    return Array.from(this.store.values());
  }

  /** Total number of registered connectors. */
  get size(): number {
    return this.store.size;
  }

  /** Find a connector + operation by connector id and operation id. */
  findOperation(connectorId: string, operationId: string): { connector: Connector; op: import('./types.js').Operation } | null {
    const connector = this.store.get(connectorId);
    if (!connector) return null;
    const op = connector.operations.find(o => o.operationId === operationId);
    return op ? { connector, op } : null;
  }

  /** Summary suitable for CLI output. */
  summary(): {
    total: number;
    connectors: Array<{ id: string; name: string; operationCount: number; discoveredAt: string; strategy: string }>;
  } {
    return {
      total: this.store.size,
      connectors: this.list().map(c => ({
        id: c.id,
        name: c.name,
        operationCount: c.operations.length,
        discoveredAt: c.discoveredAt,
        strategy: c.discoveryStrategy,
      })),
    };
  }

  private loadFromDisk(dir: string): void {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.connector.json'));
      for (const file of files) {
        const raw = readFileSync(join(dir, file), 'utf-8');
        const connector = JSON.parse(raw) as Connector;
        this.store.set(connector.id, connector);
      }
    } catch { /* non-fatal */ }
  }

  private saveToDisk(connector: Connector): void {
    if (!this.stateDir) return;
    mkdirSync(this.stateDir, { recursive: true });
    writeFileSync(
      join(this.stateDir, `${connector.id}.connector.json`),
      JSON.stringify(connector, null, 2),
      'utf-8'
    );
  }
}

// ---------------------------------------------------------------------------
// Default registry — loads bundled connectors/
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUNDLED_CONNECTORS_DIR = join(__dirname, '..', 'connectors');

let _defaultRegistry: ConnectorRegistry | null = null;

/**
 * Returns a singleton registry pre-loaded with bundled connectors
 * (stripe, calendly, twilio-messaging).
 */
export function getDefaultRegistry(): ConnectorRegistry {
  if (_defaultRegistry) return _defaultRegistry;
  _defaultRegistry = new ConnectorRegistry(null);
  if (existsSync(BUNDLED_CONNECTORS_DIR)) {
    try {
      const files = readdirSync(BUNDLED_CONNECTORS_DIR).filter(f => f.endsWith('.connector.json'));
      for (const file of files) {
        _defaultRegistry.addFromFile(join(BUNDLED_CONNECTORS_DIR, file));
      }
    } catch { /* non-fatal */ }
  }
  return _defaultRegistry;
}
