/**
 * Tests for StripeMcpConnector (Tier 1 — MCP).
 *
 * All tests use a mocked MCP server — no real Stripe API key is required.
 * The McpConnector base class is also mocked so we never spawn a real process.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StripeMcpConnector, STRIPE_MCP_CAPABILITIES } from "../connectors/stripe-mcp.js";
import type { TenantConfig } from "../types.js";
import type { SecretRef, SecretStore, StoreCapabilities } from "@penelope/secrets";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockTenant: TenantConfig = {
  tenantId: "test-tenant",
  settings: {},
};

const mockSecretRef: SecretRef = {
  tenantId: "test-tenant",
  key: "STRIPE_SECRET_KEY",
};

/** In-memory SecretStore used in tests (no OS keychain dependency). */
function makeMemoryStore(seed: Record<string, string> = {}): SecretStore {
  const db = new Map<string, string>(Object.entries(seed));
  return {
    capabilities(): StoreCapabilities {
      return { persistent: false, encryptedAtRest: false, backend: "memory" };
    },
    async available() {
      return true;
    },
    async set(ref: SecretRef, value: string) {
      db.set(`${ref.tenantId}:${ref.key}`, value);
    },
    async get(ref: SecretRef) {
      return db.get(`${ref.tenantId}:${ref.key}`);
    },
    async delete(ref: SecretRef) {
      db.delete(`${ref.tenantId}:${ref.key}`);
    },
    async list(tenantId: string) {
      const refs: SecretRef[] = [];
      for (const [k] of db) {
        if (k.startsWith(`${tenantId}:`)) {
          refs.push({ tenantId, key: k.slice(tenantId.length + 1) });
        }
      }
      return refs;
    },
  };
}

// ─── Mock the base McpConnector internals ─────────────────────────────────────
//
// McpConnector.init() calls _connect() which spawns a real child process.
// We stub the protected method so no npx process is ever launched.

vi.mock("node:child_process", () => {
  const EventEmitter =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:events").EventEmitter as typeof import("node:events").EventEmitter;

  /**
   * Minimal fake ChildProcess that satisfies McpConnector's I/O expectations.
   * Responds to 'initialize' and 'tools/list' / 'tools/call' requests.
   */
  class FakeStdout extends EventEmitter {
    setEncoding(_enc: string) {
      // no-op in tests; real Readable streams support this
      return this;
    }
  }

  class FakeChildProcess extends EventEmitter {
    stdin = {
      writable: true,
      write: vi.fn((line: string) => {
        // Parse the JSON-RPC request and emit a synthetic response on stdout.
        let req: { id: number; method: string; params?: unknown };
        try {
          req = JSON.parse(line.trim()) as typeof req;
        } catch {
          return;
        }
        // Notification (no id) — ignore
        if (!("id" in req)) return;

        let result: unknown;
        if (req.method === "initialize") {
          result = {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "stripe-mcp-mock", version: "0.0.1" },
          };
        } else if (req.method === "tools/list") {
          result = { tools: [] };
        } else if (req.method === "tools/call") {
          const params = req.params as { name: string; arguments?: unknown };
          result = { content: [{ type: "text", text: JSON.stringify({ tool: params.name, ok: true }) }] };
        } else {
          // Unknown method — return an error
          const response = JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          }) + "\n";
          this.stdout.emit("data", response);
          return;
        }

        const response = JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n";
        this.stdout.emit("data", response);
      }),
    };

    stdout = new FakeStdout();
    stderr = new EventEmitter();
  }

  return {
    spawn: vi.fn(() => new FakeChildProcess()),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StripeMcpConnector — constructor", () => {
  it("exposes the correct id, tier, and category", () => {
    const conn = new StripeMcpConnector();
    expect(conn.id).toBe("stripe-mcp");
    expect(conn.tier).toBe("mcp");
    expect(conn.category).toBe("payments");
  });

  it("takes tenant config and a secret ref without throwing", () => {
    expect(() => new StripeMcpConnector()).not.toThrow();
  });

  it("exposes all 8 required capabilities", () => {
    const conn = new StripeMcpConnector();
    expect([...conn.capabilities]).toEqual(expect.arrayContaining(STRIPE_MCP_CAPABILITIES));
    expect(conn.capabilities.length).toBe(8);
  });
});

describe("StripeMcpConnector — init()", () => {
  afterEach(() => {
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("spawns the MCP server with correct args when env var is set", async () => {
    const { spawn } = await import("node:child_process");
    const spawnSpy = vi.mocked(spawn);
    spawnSpy.mockClear();

    process.env["STRIPE_SECRET_KEY"] = "sk_test_mock";

    const conn = new StripeMcpConnector();
    await conn.init(mockTenant, mockSecretRef);

    expect(spawnSpy).toHaveBeenCalledOnce();
    const [cmd, args] = spawnSpy.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("npx");
    expect(args).toContain("-y");
    expect(args).toContain("@stripe/mcp");
    expect(args).toContain("--tools=all");
    expect(args.some((a) => a.startsWith("--api-key="))).toBe(true);
    expect(args.some((a) => a.includes("sk_test_mock"))).toBe(true);
  });

  it("resolves API key from injected SecretStore", async () => {
    const { spawn } = await import("node:child_process");
    const spawnSpy = vi.mocked(spawn);
    spawnSpy.mockClear();

    const store = makeMemoryStore({
      "test-tenant:STRIPE_SECRET_KEY": "sk_test_from_store",
    });
    const conn = new StripeMcpConnector().withSecretStore(store);
    await conn.init(mockTenant, mockSecretRef);

    expect(spawnSpy).toHaveBeenCalledOnce();
    const [, args] = spawnSpy.mock.calls[0] as [string, string[]];
    expect(args.some((a) => a.includes("sk_test_from_store"))).toBe(true);
  });

  it("throws when API key is absent (no store, no env var)", async () => {
    delete process.env["STRIPE_SECRET_KEY"];
    const conn = new StripeMcpConnector();
    await expect(conn.init(mockTenant, mockSecretRef)).rejects.toThrow(
      /Missing API key|not set|not found/i
    );
  });
});

describe("StripeMcpConnector — invoke()", () => {
  beforeEach(async () => {
    // Suppress a stray env value that another test may have left.
    process.env["STRIPE_SECRET_KEY"] = "sk_test_invoke";
  });

  afterEach(() => {
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("maps invoke('list_customers') to MCP tools/call correctly", async () => {
    const { spawn } = await import("node:child_process");
    const spawnSpy = vi.mocked(spawn);
    spawnSpy.mockClear();

    const conn = new StripeMcpConnector();
    await conn.init(mockTenant, mockSecretRef);

    const result = (await conn.invoke("list_customers", { limit: 10 })) as {
      content: Array<{ type: string; text: string }>;
    };

    // The fake child process echoes back { tool: "list_customers", ok: true }
    expect(result).toBeDefined();
    const parsed = JSON.parse(result.content[0].text) as { tool: string; ok: boolean };
    expect(parsed.tool).toBe("list_customers");
    expect(parsed.ok).toBe(true);
  });
});

describe("StripeMcpConnector — error handling", () => {
  it("throws a descriptive error when SecretStore has no key for tenant", async () => {
    const store = makeMemoryStore({}); // empty — no key stored
    const conn = new StripeMcpConnector().withSecretStore(store);

    await expect(conn.init(mockTenant, mockSecretRef)).rejects.toThrow(
      /not found/i
    );
  });

  it("respects custom stripeSecretKeyRef setting", async () => {
    const store = makeMemoryStore({
      "test-tenant:MY_CUSTOM_KEY": "sk_test_custom",
    });
    const tenant: TenantConfig = {
      tenantId: "test-tenant",
      settings: { stripeSecretKeyRef: "MY_CUSTOM_KEY" },
    };
    const conn = new StripeMcpConnector().withSecretStore(store);
    // Should NOT throw — the custom ref resolves correctly.
    await expect(conn.init(tenant, mockSecretRef)).resolves.toBeUndefined();
  });
});
