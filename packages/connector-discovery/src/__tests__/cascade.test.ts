/**
 * cascade.test.ts — cascade ordering + tier-skip behaviour
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscoveryRequest, DiscoveryResult } from "../types.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<DiscoveryRequest> = {}): DiscoveryRequest {
  return {
    service: "TestService",
    capabilities: ["login", "list-items"],
    owner_email: "owner@example.com",
    ...overrides,
  };
}

function makeTierResult(tier: 1 | 2 | 3 | 4 | 5, confidence = 0.8): DiscoveryResult {
  return {
    tier,
    connector_spec:
      tier === 1
        ? { kind: "mcp", packageName: "mcp-test", version: "1.0.0", registryUrl: "https://npm", installCommand: "npx mcp-test" }
        : tier === 2
        ? { kind: "api-skill", packagePath: "/path/to/skill.ts", exportedSymbol: "testSkill", requiredEnv: [] }
        : tier === 3
        ? { kind: "openapi", specUrl: "https://test.com/openapi.json", title: "Test", version: "1.0.0" }
        : tier === 4
        ? { kind: "recipe", recipe: { name: "test-recipe", service: "Test", version: "0.1.0", createdAt: "2026-06-04T00:00:00Z", steps: [], selectors: [], waits: [], requiredEnv: [] } }
        : { kind: "computer-use", sessionId: "cu-test", actions: [] },
    confidence,
    evidence: [{ tier, source: `mock-tier-${tier}`, outcome: "hit", detail: "mocked", at: "2026-06-04T00:00:00Z" }],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("discoverConnector — cascade ordering", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns tier-1 when MCP search hits", async () => {
    vi.doMock("../find-mcp.js", () => ({
      findMcp: vi.fn().mockResolvedValue(makeTierResult(1)),
    }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn() }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn() }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest());

    expect(result.tier).toBe(1);
    expect(result.connector_spec.kind).toBe("mcp");
  });

  it("skips tier-1 and returns tier-2 when MCP misses", async () => {
    vi.doMock("../find-mcp.js", () => ({
      findMcp: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("../find-api-skill.js", () => ({
      findApiSkill: vi.fn().mockResolvedValue(makeTierResult(2)),
    }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn() }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest());

    expect(result.tier).toBe(2);
    expect(result.connector_spec.kind).toBe("api-skill");
  });

  it("falls all the way to tier-4 when tiers 1-3 miss", async () => {
    vi.doMock("../find-mcp.js", () => ({ findMcp: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../recipe-builder.js", () => ({
      buildRecipe: vi.fn().mockResolvedValue(makeTierResult(4)),
    }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest());

    expect(result.tier).toBe(4);
    expect(result.connector_spec.kind).toBe("recipe");
  });

  it("falls to tier-5 when tiers 1-4 all fail", async () => {
    vi.doMock("../find-mcp.js", () => ({ findMcp: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../recipe-builder.js", () => ({
      buildRecipe: vi.fn().mockRejectedValue(new Error("no browser")),
    }));
    vi.doMock("../computer-use-fallback.js", () => ({
      computerUseFallback: vi.fn().mockResolvedValue(makeTierResult(5, 0.5)),
    }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest());

    expect(result.tier).toBe(5);
  });

  it("respects skipTiers — skips tier-1 and -2 when requested", async () => {
    const mcpSpy = vi.fn().mockResolvedValue(makeTierResult(1));
    const skillSpy = vi.fn().mockResolvedValue(makeTierResult(2));
    vi.doMock("../find-mcp.js", () => ({ findMcp: mcpSpy }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: skillSpy }));
    vi.doMock("../find-openapi.js", () => ({
      findOpenApi: vi.fn().mockResolvedValue(makeTierResult(3)),
    }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest({ skipTiers: [1, 2] }));

    expect(mcpSpy).not.toHaveBeenCalled();
    expect(skillSpy).not.toHaveBeenCalled();
    expect(result.tier).toBe(3);
  });

  it("calls onTierResult callback for each attempted tier", async () => {
    vi.doMock("../find-mcp.js", () => ({ findMcp: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-openapi.js", () => ({
      findOpenApi: vi.fn().mockResolvedValue(makeTierResult(3)),
    }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const calls: Array<[number, boolean]> = [];
    await discoverConnector(makeRequest(), {
      onTierResult: (tier, hit) => calls.push([tier, hit]),
    });

    expect(calls).toContainEqual([1, false]);
    expect(calls).toContainEqual([2, false]);
    expect(calls).toContainEqual([3, true]);
  });

  it("throws on empty service name", async () => {
    vi.doMock("../find-mcp.js", () => ({ findMcp: vi.fn() }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn() }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn() }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    await expect(discoverConnector(makeRequest({ service: "   " }))).rejects.toThrow(
      "non-empty string"
    );
  });

  it("accumulates evidence across all tiers that were tried", async () => {
    vi.doMock("../find-mcp.js", () => ({ findMcp: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-openapi.js", () => ({
      findOpenApi: vi.fn().mockResolvedValue(makeTierResult(3)),
    }));
    vi.doMock("../recipe-builder.js", () => ({ buildRecipe: vi.fn() }));
    vi.doMock("../computer-use-fallback.js", () => ({ computerUseFallback: vi.fn() }));

    const { discoverConnector } = await import("../cascade.js");
    const result = await discoverConnector(makeRequest());

    // tier-3 evidence is included; tiers 1+2 returned null (no evidence)
    const tiers = result.evidence.map((e) => e.tier);
    expect(tiers).toContain(3);
  });
});
