/**
 * promote.test.ts — promote eligibility and reliability store
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordSuccess,
  checkPromoteEligibility,
  formatPromoteSuggestion,
  InMemoryReliabilityStore,
  PROMOTE_RELIABILITY_THRESHOLD_DAYS,
} from "../promote.js";
import type { Recipe } from "../types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecipe(service = "TestService"): Recipe {
  return {
    name: `${service.toLowerCase()}-recipe`,
    service,
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    steps: [],
    selectors: [],
    waits: [],
    requiredEnv: [],
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InMemoryReliabilityStore", () => {
  it("returns null for unknown service", async () => {
    const store = new InMemoryReliabilityStore();
    expect(await store.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves a record", async () => {
    const store = new InMemoryReliabilityStore();
    const now = new Date().toISOString();
    await store.upsert({
      service: "Acme",
      currentTier: 4,
      recipe: makeRecipe("Acme"),
      firstSuccessAt: now,
      lastSuccessAt: now,
      successCount: 1,
      failureCount: 0,
      owner_email: "owner@acme.com",
    });
    const record = await store.get("Acme");
    expect(record).not.toBeNull();
    expect(record?.service).toBe("Acme");
  });
});

describe("recordSuccess()", () => {
  it("creates a new record on first call", async () => {
    const store = new InMemoryReliabilityStore();
    await recordSuccess("TestSvc", makeRecipe("TestSvc"), "test@example.com", store);
    const record = await store.get("TestSvc");
    expect(record?.successCount).toBe(1);
  });

  it("increments successCount on subsequent calls", async () => {
    const store = new InMemoryReliabilityStore();
    const recipe = makeRecipe("TestSvc");
    await recordSuccess("TestSvc", recipe, "test@example.com", store);
    await recordSuccess("TestSvc", recipe, "test@example.com", store);
    await recordSuccess("TestSvc", recipe, "test@example.com", store);
    const record = await store.get("TestSvc");
    expect(record?.successCount).toBe(3);
  });
});

describe("checkPromoteEligibility()", () => {
  it("returns null if no reliability record exists", async () => {
    const store = new InMemoryReliabilityStore();
    const result = await checkPromoteEligibility("Nonexistent", store);
    expect(result).toBeNull();
  });

  it("returns null if fewer than threshold days have elapsed", async () => {
    const store = new InMemoryReliabilityStore();
    const threeDaysAgo = daysAgo(3);
    await store.upsert({
      service: "TestSvc",
      currentTier: 4,
      recipe: makeRecipe("TestSvc"),
      firstSuccessAt: threeDaysAgo,
      lastSuccessAt: new Date().toISOString(),
      successCount: 10,
      failureCount: 0,
      owner_email: "owner@test.com",
    });

    // All tier finders return null → no upgrade available anyway
    const result = await checkPromoteEligibility("TestSvc", store, PROMOTE_RELIABILITY_THRESHOLD_DAYS);
    expect(result).toBeNull();
  });

  it("returns PromoteCandidate when threshold met and better tier available", async () => {
    vi.resetModules();

    const store = new InMemoryReliabilityStore();
    const elevenDaysAgo = daysAgo(11);
    await store.upsert({
      service: "ToastPOS",
      currentTier: 4,
      recipe: makeRecipe("ToastPOS"),
      firstSuccessAt: elevenDaysAgo,
      lastSuccessAt: new Date().toISOString(),
      successCount: 100,
      failureCount: 0,
      owner_email: "owner@toastpos.com",
    });

    // Mock findMcp to return a tier-1 result
    vi.doMock("../find-mcp.js", () => ({
      findMcp: vi.fn().mockResolvedValue({
        tier: 1,
        connector_spec: { kind: "mcp", packageName: "mcp-toast", version: "1.0.0", registryUrl: "https://npm", installCommand: "npx mcp-toast" },
        confidence: 0.85,
        evidence: [],
      }),
    }));
    vi.doMock("../find-api-skill.js", () => ({ findApiSkill: vi.fn().mockResolvedValue(null) }));
    vi.doMock("../find-openapi.js", () => ({ findOpenApi: vi.fn().mockResolvedValue(null) }));

    const { checkPromoteEligibility: check } = await import("../promote.js");
    const candidate = await check("ToastPOS", store, 10);

    expect(candidate).not.toBeNull();
    expect(candidate?.targetTier).toBe(1);
    expect(candidate?.currentTier).toBe(4);
    expect(candidate?.daysReliable).toBeGreaterThanOrEqual(10);
  });
});

describe("formatPromoteSuggestion()", () => {
  it("includes the service name", () => {
    const msg = formatPromoteSuggestion({
      service: "Vagaro",
      currentTier: 4,
      targetTier: 3,
      recipe: makeRecipe("Vagaro"),
      daysReliable: 14,
      proposedSpec: { kind: "openapi", specUrl: "https://vagaro.com/openapi.json", title: "Vagaro", version: "1.0.0" },
      owner_email: "owner@vagaro.com",
    });

    expect(msg).toContain("Vagaro");
  });

  it("mentions the number of reliable days", () => {
    const msg = formatPromoteSuggestion({
      service: "Vagaro",
      currentTier: 4,
      targetTier: 3,
      recipe: makeRecipe("Vagaro"),
      daysReliable: 14,
      proposedSpec: { kind: "openapi", specUrl: "https://vagaro.com/openapi.json", title: "Vagaro", version: "1.0.0" },
      owner_email: "owner@vagaro.com",
    });

    expect(msg).toContain("14");
  });

  it("includes a promote command", () => {
    const msg = formatPromoteSuggestion({
      service: "Acme",
      currentTier: 4,
      targetTier: 1,
      recipe: makeRecipe("Acme"),
      daysReliable: 20,
      proposedSpec: { kind: "mcp", packageName: "mcp-acme", version: "1.0.0", registryUrl: "https://npm", installCommand: "npx mcp-acme" },
      owner_email: "owner@acme.com",
    });

    expect(msg).toContain("penelope connector promote Acme");
  });

  it("mentions MCP for tier-1 upgrade", () => {
    const msg = formatPromoteSuggestion({
      service: "Acme",
      currentTier: 4,
      targetTier: 1,
      recipe: makeRecipe("Acme"),
      daysReliable: 12,
      proposedSpec: { kind: "mcp", packageName: "mcp-acme", version: "1.0.0", registryUrl: "https://npm", installCommand: "npx mcp-acme" },
      owner_email: "owner@acme.com",
    });

    expect(msg.toLowerCase()).toContain("mcp");
  });
});
