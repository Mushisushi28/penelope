/**
 * BrowserSpecialist unit tests — all Stagehand calls are mocked.
 * No real browser is launched.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";
import {
  BrowserSpecialist,
  registerRecipe,
  requiresConfirmation,
  type BrowserSpecialistConfig,
  type StagehandFactory,
  type StagehandInstance,
  type StagehandPage,
} from "../specialists/browser.js";

// ─── Mock Stagehand helpers ───────────────────────────────────────────────────

function makeMockPage(overrides: Partial<StagehandPage> = {}): StagehandPage {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    act: vi.fn().mockResolvedValue({ action: "click", target: "button", result: "completed" }),
    extract: vi.fn().mockResolvedValue({ data: "extracted" }),
    screenshot: vi.fn().mockResolvedValue("base64screenshot"),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMockStagehand(page: StagehandPage): StagehandInstance {
  return {
    page,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFactory(page: StagehandPage): StagehandFactory {
  const instance = makeMockStagehand(page);
  return vi.fn().mockResolvedValue(instance);
}

function makeConfig(
  overrides: Partial<BrowserSpecialistConfig> = {},
): BrowserSpecialistConfig {
  const page = makeMockPage();
  return {
    role: "browser",
    tenant_id: "tenant-test-1",
    tenants_root: "/tmp/penelope-test-tenants",
    stagehandFactory: makeFactory(page),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BrowserSpecialist", () => {
  // 1. Constructor validates tenant
  describe("constructor", () => {
    it("throws when tenant_id is empty string", () => {
      expect(
        () => new BrowserSpecialist({ ...makeConfig(), tenant_id: "" }),
      ).toThrow("[BrowserSpecialist] tenant_id is required");
    });

    it("throws when tenant_id is whitespace-only", () => {
      expect(
        () => new BrowserSpecialist({ ...makeConfig(), tenant_id: "   " }),
      ).toThrow("[BrowserSpecialist] tenant_id is required");
    });

    it("constructs successfully with a valid tenant_id", () => {
      const s = new BrowserSpecialist(makeConfig({ tenant_id: "tenant-abc" }));
      expect(s.tenantId).toBe("tenant-abc");
      expect(s.role).toBe("browser");
    });
  });

  // 2. execute() returns step traces
  describe("execute() — step traces", () => {
    it("returns a BrowserResult with steps array", async () => {
      const page = makeMockPage();
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "click the submit button", startUrl: "https://example.com" });

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0]).toMatchObject({ step_n: 1 });
    });

    it("first step is navigate when startUrl is provided", async () => {
      const page = makeMockPage();
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "extract data", startUrl: "https://example.com/page" });

      const navStep = result.steps.find((s) => s.action === "navigate");
      expect(navStep).toBeDefined();
      expect(navStep!.target).toBe("https://example.com/page");
    });

    it("does not emit navigate step when startUrl is omitted", async () => {
      const page = makeMockPage();
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "extract data" });

      const navStep = result.steps.find((s) => s.action === "navigate");
      expect(navStep).toBeUndefined();
    });
  });

  // 3. maxSteps cap enforced
  describe("execute() — maxSteps cap", () => {
    it("returns escalation when maxSteps is exceeded", async () => {
      // act() always returns a non-terminal result to keep the loop running
      const page = makeMockPage({
        act: vi.fn().mockResolvedValue({ action: "click", target: "next-button", result: "clicked" }),
        extract: vi.fn().mockResolvedValue({}),
      });
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({
        goal: "paginate through results forever",
        startUrl: "https://example.com",
        maxSteps: 3,
      });

      expect(result.ok).toBe(false);
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.reason).toBe("max-steps-exceeded");
      expect(result.steps.length).toBeLessThanOrEqual(3);
    });

    it("respects default maxSteps of 25", async () => {
      const page = makeMockPage({
        act: vi.fn().mockResolvedValue({ action: "click", target: "btn", result: "clicked" }),
        extract: vi.fn().mockResolvedValue({}),
      });
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "loop forever", startUrl: "https://example.com" });

      expect(result.steps.length).toBeLessThanOrEqual(26); // 1 navigate + up to 25 action steps
    });
  });

  // 4. confirm-needed pause-and-escalate
  describe("execute() — confirm-needed escalation", () => {
    it("pauses and returns escalation when action target matches confirm pattern", async () => {
      const page = makeMockPage({
        act: vi.fn().mockResolvedValue({
          action: "click",
          target: "Buy Now button",
          result: "ready to purchase",
        }),
        extract: vi.fn().mockResolvedValue({}),
      });
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "buy the item", startUrl: "https://shop.example.com" });

      expect(result.ok).toBe(false);
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.reason).toBe("confirm-needed");
    });

    it("includes step trace for the paused action", async () => {
      const page = makeMockPage({
        act: vi.fn().mockResolvedValue({
          action: "click",
          target: "Delete Account",
          result: "about to delete",
        }),
        extract: vi.fn().mockResolvedValue({}),
      });
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "delete account", startUrl: "https://app.example.com" });

      const pausedStep = result.steps.find((s) => s.result.includes("confirm-needed"));
      expect(pausedStep).toBeDefined();
    });
  });

  // 5. Sandbox isolation — two tenants get separate profiles
  describe("sandbox isolation", () => {
    it("two tenants produce different chromeProfilePath values", () => {
      const s1 = new BrowserSpecialist(makeConfig({ tenant_id: "tenant-alpha" }));
      const s2 = new BrowserSpecialist(makeConfig({ tenant_id: "tenant-beta" }));

      expect(s1.chromeProfilePath).not.toBe(s2.chromeProfilePath);
      expect(s1.chromeProfilePath).toContain("tenant-alpha");
      expect(s2.chromeProfilePath).toContain("tenant-beta");
    });

    it("stagehandFactory is called with tenant-specific userDataDir", async () => {
      const factory: MockedFunction<StagehandFactory> = vi.fn().mockResolvedValue(
        makeMockStagehand(makeMockPage()),
      );
      const s = new BrowserSpecialist(
        makeConfig({ tenant_id: "isolated-tenant", stagehandFactory: factory }),
      );

      await s.execute({ goal: "test isolation", startUrl: "https://example.com" });

      expect(factory).toHaveBeenCalledWith(expect.stringContaining("isolated-tenant"));
    });
  });

  // 6. Recipe registration
  describe("recipe registration", () => {
    it("registered recipe is invoked for matching goal", async () => {
      const recipeHandler = vi.fn().mockResolvedValue({ extracted: "recipe-data" });
      registerRecipe("test-recipe-42", recipeHandler);

      const page = makeMockPage();
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "test-recipe-42", startUrl: "https://example.com" });

      expect(recipeHandler).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.extracted).toEqual({ extracted: "recipe-data" });
    });

    it("free-form loop is used when no recipe matches", async () => {
      const page = makeMockPage();
      const factory: MockedFunction<StagehandFactory> = vi.fn().mockResolvedValue(
        makeMockStagehand(page),
      );
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: factory }));

      const result = await s.execute({ goal: "unregistered-free-form-goal-xyz" });

      // Should reach the extract() call in the free-form loop
      expect(page.extract).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  // 7. Error envelope on Stagehand failure
  describe("error handling", () => {
    it("wraps Stagehand errors in a BrowserResult error envelope", async () => {
      const page = makeMockPage({
        goto: vi.fn().mockRejectedValue(new Error("Navigation timeout")),
      });
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: makeFactory(page) }));

      const result = await s.execute({ goal: "open page", startUrl: "https://example.com" });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Navigation timeout");
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.reason).toBe("error");
    });

    it("closes stagehand even when an error is thrown", async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const page = makeMockPage({
        goto: vi.fn().mockRejectedValue(new Error("crash")),
      });
      const instance = makeMockStagehand(page);
      instance.close = mockClose;
      const factory: StagehandFactory = vi.fn().mockResolvedValue(instance);
      const s = new BrowserSpecialist(makeConfig({ stagehandFactory: factory }));

      await s.execute({ goal: "crash test", startUrl: "https://example.com" });

      expect(mockClose).toHaveBeenCalled();
    });
  });

  // 8. Specialist refuses telegram-owner adapter
  describe("telegram-owner adapter guard", () => {
    it("throws when acquireTelegramOwnerAdapter is called", () => {
      const s = new BrowserSpecialist(makeConfig());
      // Access the protected method via casting
      expect(() =>
        (s as unknown as { acquireTelegramOwnerAdapter(): never }).acquireTelegramOwnerAdapter(),
      ).toThrow("SpecialistAgent(browser) attempted to acquire the telegram-owner adapter");
    });
  });
});

// ─── requiresConfirmation unit tests ─────────────────────────────────────────

describe("requiresConfirmation", () => {
  it.each([
    ["Buy Now", true],
    ["buy now button", true],
    ["Purchase item", true],
    ["Pay with card", true],
    ["Submit Order", true],
    ["Place Order", true],
    ["checkout", true],
    ["Delete Account", true],
    ["Remove Account", true],
    ["Unsubscribe", true],
    ["Cancel Subscription", true],
    ["Search", false],
    ["Navigate to page", false],
    ["Extract data", false],
    ["Click the menu", false],
    ["Type in search box", false],
  ])('requiresConfirmation("%s") === %s', (input, expected) => {
    expect(requiresConfirmation(input)).toBe(expected);
  });
});
