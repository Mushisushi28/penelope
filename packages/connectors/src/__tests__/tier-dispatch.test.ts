import { describe, it, expect } from "vitest";
import { ApiSkillConnector } from "../tier-api-skill.js";
import { HermesConnector } from "../tier-hermes.js";
import { BrowserConnector } from "../tier-browser.js";
import { ComputerUseConnector } from "../tier-computer-use.js";
import type { TenantConfig } from "../types.js";
import type { SecretRef } from "@penelope/secrets";

const mockTenant: TenantConfig = { tenantId: "test-tenant", settings: {} };
const mockSecret: SecretRef = { tenantId: "test-tenant", key: "api-key" };

// ─── ApiSkillConnector ────────────────────────────────────────────────────────

class TestApiSkill extends ApiSkillConnector {
  readonly id = "test-api-skill";
  readonly displayName = "Test API Skill";
  readonly description = "Used in tests.";
  readonly category = "payments" as const;
  readonly capabilities = ["charge"] as const;

  protected async onInit(): Promise<void> {}

  async invoke(op: string, _args: unknown): Promise<unknown> {
    if (op === "ping") return { pong: true };
    throw new Error(`unsupported op: ${op}`);
  }
}

describe("ApiSkillConnector", () => {
  it("has tier api-skill", () => {
    expect(new TestApiSkill().tier).toBe("api-skill");
  });

  it("invokes after init", async () => {
    const skill = new TestApiSkill();
    await skill.init(mockTenant, mockSecret);
    const result = await skill.invoke("ping", {});
    expect(result).toEqual({ pong: true });
  });

  it("healthCheck ok after init", async () => {
    const skill = new TestApiSkill();
    await skill.init(mockTenant, mockSecret);
    const health = await skill.healthCheck();
    expect(health.ok).toBe(true);
  });

  it("healthCheck not ok before init", async () => {
    const skill = new TestApiSkill();
    const health = await skill.healthCheck();
    expect(health.ok).toBe(false);
  });

  it("throws on unknown op", async () => {
    const skill = new TestApiSkill();
    await skill.init(mockTenant, mockSecret);
    await expect(skill.invoke("unknown", {})).rejects.toThrow("unsupported op");
  });
});

// ─── HermesConnector ─────────────────────────────────────────────────────────

class TestHermes extends HermesConnector {
  readonly id = "test-hermes";
  readonly displayName = "Test Hermes";
  readonly description = "Used in tests.";
  readonly category = "accounting" as const;
  readonly capabilities = ["list-records"] as const;
  readonly specConfig = {
    specUrl: "https://example.com/openapi.json",
    baseUrl: "https://example.com",
    securityScheme: "bearerAuth" as const,
  };
}

describe("HermesConnector", () => {
  it("has tier hermes-openapi", () => {
    expect(new TestHermes().tier).toBe("hermes-openapi");
  });

  it("throws on unknown operation", async () => {
    const connector = new TestHermes();
    await connector.init(mockTenant, mockSecret);
    await expect(connector.invoke("nonexistent", {})).rejects.toThrow(
      "unknown operation: nonexistent"
    );
  });

  it("throws before init", async () => {
    const connector = new TestHermes();
    await expect(connector.invoke("list", {})).rejects.toThrow("not initialised");
  });
});

// ─── BrowserConnector ─────────────────────────────────────────────────────────

class TestBrowser extends BrowserConnector {
  readonly id = "test-browser";
  readonly displayName = "Test Browser";
  readonly description = "Used in tests.";
  readonly category = "reviews" as const;
  readonly capabilities = ["review-ask"] as const;

  protected defaultRecipes() {
    return {
      "test-op": {
        name: "Test Recipe",
        steps: [{ action: "navigate" as const, url: "https://example.com" }],
      },
    };
  }
}

describe("BrowserConnector", () => {
  it("has tier browser", () => {
    expect(new TestBrowser().tier).toBe("browser");
  });

  it("uses default recipes after init", async () => {
    const conn = new TestBrowser();
    await conn.init(mockTenant, mockSecret);
    // Invoking will fail because there's no real CCEMOD server; that's OK.
    await expect(conn.invoke("test-op", {})).rejects.toThrow();
  });

  it("throws on missing recipe", async () => {
    const conn = new TestBrowser();
    await conn.init(mockTenant, mockSecret);
    await expect(conn.invoke("no-such-op", {})).rejects.toThrow(
      "no recipe for op: no-such-op"
    );
  });

  it("throws before init", async () => {
    const conn = new TestBrowser();
    await expect(conn.invoke("test-op", {})).rejects.toThrow("not initialised");
  });
});

// ─── ComputerUseConnector ─────────────────────────────────────────────────────

class TestComputerUse extends ComputerUseConnector {
  readonly id = "test-cu";
  readonly displayName = "Test CU";
  readonly description = "Used in tests.";
  readonly category = "other" as const;
  readonly capabilities = [] as const;

  protected defaultGoals() {
    return {
      "open-app": { goalTemplate: "Open {{appName}} and take a screenshot." },
    };
  }
}

describe("ComputerUseConnector", () => {
  it("has tier computer-use", () => {
    expect(new TestComputerUse().tier).toBe("computer-use");
  });

  it("throws without API key", async () => {
    const conn = new TestComputerUse();
    // No API key in settings, no env var.
    const originalKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    await expect(conn.init(mockTenant, mockSecret)).rejects.toThrow(
      "anthropicApiKey must be set"
    );
    if (originalKey !== undefined) process.env["ANTHROPIC_API_KEY"] = originalKey;
  });

  it("throws on missing goal after init", async () => {
    const conn = new TestComputerUse();
    await conn.init(
      { ...mockTenant, settings: { anthropicApiKey: "sk-test" } },
      mockSecret
    );
    await expect(conn.invoke("nonexistent", {})).rejects.toThrow(
      "no goal for op: nonexistent"
    );
  });
});
