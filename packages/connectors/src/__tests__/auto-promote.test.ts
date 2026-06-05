import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluatePromotions,
  registerOpenApiSpec,
  registerMcpAvailable,
  registerApiSkillAvailable,
} from "../auto-promote.js";
import type { ConnectorDescriptor } from "../types.js";
import type { UsageSample } from "../auto-promote.js";

function desc(
  id: string,
  tier: ConnectorDescriptor["tier"]
): ConnectorDescriptor {
  return {
    id,
    displayName: id,
    description: "test",
    tier,
    category: "other",
    capabilities: [],
    implementationStatus: "stub",
  };
}

function sample(connectorId: string, invocations: number): UsageSample {
  return {
    connectorId,
    invocations,
    windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

describe("evaluatePromotions", () => {
  beforeEach(() => {
    // Register upgrade hints used in tests.
    registerOpenApiSpec("legacy-cu", "https://example.com/openapi.json");
    registerApiSkillAvailable("browser-with-skill");
    registerMcpAvailable("hermes-with-mcp");
  });

  it("suggests computer-use → hermes-openapi when spec available and frequent", () => {
    const suggestions = evaluatePromotions(
      [desc("legacy-cu", "computer-use")],
      [sample("legacy-cu", 20)]
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestedTier).toBe("hermes-openapi");
    expect(suggestions[0]?.approved).toBe(false);
  });

  it("does NOT suggest when usage is too low", () => {
    const suggestions = evaluatePromotions(
      [desc("legacy-cu", "computer-use")],
      [sample("legacy-cu", 3)]
    );
    expect(suggestions).toHaveLength(0);
  });

  it("suggests browser → api-skill when skill available and frequent", () => {
    const suggestions = evaluatePromotions(
      [desc("browser-with-skill", "browser")],
      [sample("browser-with-skill", 15)]
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestedTier).toBe("api-skill");
  });

  it("suggests hermes-openapi → mcp when MCP server available", () => {
    const suggestions = evaluatePromotions(
      [desc("hermes-with-mcp", "hermes-openapi")],
      [sample("hermes-with-mcp", 12)]
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestedTier).toBe("mcp");
  });

  it("returns no suggestions when no sample provided", () => {
    const suggestions = evaluatePromotions(
      [desc("legacy-cu", "computer-use")],
      []
    );
    expect(suggestions).toHaveLength(0);
  });

  it("includes createdAt timestamp", () => {
    const suggestions = evaluatePromotions(
      [desc("legacy-cu", "computer-use")],
      [sample("legacy-cu", 20)]
    );
    expect(suggestions[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
