import { describe, it, expect, beforeEach } from "vitest";
import {
  register,
  get,
  getDescriptor,
  byCategory,
  byTier,
  all,
  clear,
} from "../registry.js";
import type { ConnectorDescriptor, Connector, TenantConfig } from "../types.js";
import type { SecretRef } from "@penelope/secrets";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDescriptor(
  overrides: Partial<ConnectorDescriptor> = {}
): ConnectorDescriptor {
  return {
    id: "test-connector",
    displayName: "Test Connector",
    description: "A test connector.",
    tier: "hermes-openapi",
    category: "payments",
    capabilities: ["charge"],
    implementationStatus: "stub",
    ...overrides,
  };
}

function makeConnector(
  overrides: Partial<ConnectorDescriptor> = {}
): Connector {
  const desc = makeDescriptor(overrides);
  return {
    ...desc,
    async init(_tenant: TenantConfig, _secrets: SecretRef): Promise<void> {},
    async invoke(_op: string, _args: unknown): Promise<unknown> {
      return { ok: true };
    },
    async healthCheck(): Promise<{ ok: boolean }> {
      return { ok: true };
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("registry", () => {
  beforeEach(() => {
    clear();
  });

  describe("register + getDescriptor", () => {
    it("stores a descriptor", () => {
      const desc = makeDescriptor();
      register(desc);
      expect(getDescriptor(desc.id)).toEqual(desc);
    });

    it("stores a full connector descriptor", () => {
      const conn = makeConnector({ id: "live-connector" });
      register(conn);
      const stored = getDescriptor("live-connector");
      expect(stored?.id).toBe("live-connector");
      expect(stored?.implementationStatus).toBe("full");
    });

    it("returns undefined for unknown id", () => {
      expect(getDescriptor("no-such-connector")).toBeUndefined();
    });
  });

  describe("get (live connector only)", () => {
    it("returns live connector after registering full impl", () => {
      const conn = makeConnector({ id: "live" });
      register(conn);
      expect(get("live")).toBe(conn);
    });

    it("returns undefined for stub-only registration", () => {
      register(makeDescriptor({ id: "stub-only" }));
      expect(get("stub-only")).toBeUndefined();
    });
  });

  describe("byCategory", () => {
    it("filters by category", () => {
      register(makeDescriptor({ id: "a", category: "payments" }));
      register(makeDescriptor({ id: "b", category: "calendar" }));
      register(makeDescriptor({ id: "c", category: "payments" }));

      const payments = byCategory("payments");
      expect(payments.map((p) => p.id).sort()).toEqual(["a", "c"]);
    });

    it("returns empty array when no connectors match", () => {
      register(makeDescriptor({ id: "a", category: "payments" }));
      expect(byCategory("email")).toHaveLength(0);
    });
  });

  describe("byTier", () => {
    it("filters by tier", () => {
      register(makeDescriptor({ id: "t1", tier: "mcp" }));
      register(makeDescriptor({ id: "t2", tier: "api-skill" }));
      register(makeDescriptor({ id: "t3", tier: "mcp" }));

      const mcpConnectors = byTier("mcp");
      expect(mcpConnectors.map((c) => c.id).sort()).toEqual(["t1", "t3"]);
    });
  });

  describe("all", () => {
    it("returns all registered descriptors", () => {
      register(makeDescriptor({ id: "x" }));
      register(makeDescriptor({ id: "y" }));
      expect(all()).toHaveLength(2);
    });

    it("returns empty array when nothing registered", () => {
      expect(all()).toHaveLength(0);
    });
  });

  describe("capability matching", () => {
    it("can filter by capability from all()", () => {
      register(
        makeDescriptor({ id: "a", capabilities: ["charge", "refund"] })
      );
      register(
        makeDescriptor({ id: "b", capabilities: ["send-message"] })
      );
      register(
        makeDescriptor({ id: "c", capabilities: ["charge"] })
      );

      const withCharge = all().filter((d) => d.capabilities.includes("charge"));
      expect(withCharge.map((d) => d.id).sort()).toEqual(["a", "c"]);
    });
  });
});
