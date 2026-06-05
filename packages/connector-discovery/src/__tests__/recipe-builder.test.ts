/**
 * recipe-builder.test.ts — recipe builder happy path with a mocked BrowserClient
 */

import { describe, it, expect, vi } from "vitest";
import { buildRecipe } from "../recipe-builder.js";
import type { BrowserClient, DomElement } from "../recipe-builder.js";
import type { DiscoveryRequest } from "../types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ELEMENTS: DomElement[] = [
  { selector: "input[type=email]", tagName: "INPUT", text: "", placeholder: "Email" },
  { selector: "input[type=password]", tagName: "INPUT", text: "", placeholder: "Password" },
  { selector: "button[type=submit]", tagName: "BUTTON", text: "Log in", role: "button" },
  { selector: "table.order-list", tagName: "TABLE", text: "", role: "table" },
  { selector: "button.new-order", tagName: "BUTTON", text: "New Order", role: "button" },
];

function makeMockClient(elements: DomElement[] = MOCK_ELEMENTS): BrowserClient {
  return {
    navigate: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue(elements),
    screenshot: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRequest(service = "Toast POS"): DiscoveryRequest {
  return {
    service,
    capabilities: ["login", "list-items", "create-item"],
    owner_email: "owner@test.com",
    baseUrl: "https://toasttab.com",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildRecipe()", () => {
  it("returns tier-4 result", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    expect(result.tier).toBe(4);
    expect(result.connector_spec.kind).toBe("recipe");
  });

  it("navigates to the service baseUrl", async () => {
    const client = makeMockClient();
    await buildRecipe(makeRequest(), { client });

    expect(client.navigate).toHaveBeenCalledWith("https://toasttab.com");
  });

  it("calls snapshot to observe DOM", async () => {
    const client = makeMockClient();
    await buildRecipe(makeRequest(), { client });

    expect(client.snapshot).toHaveBeenCalledOnce();
  });

  it("always calls close() on the client", async () => {
    const client = makeMockClient();
    await buildRecipe(makeRequest(), { client });

    expect(client.close).toHaveBeenCalledOnce();
  });

  it("calls close() even when snapshot throws", async () => {
    const client = makeMockClient();
    vi.spyOn(client, "snapshot").mockRejectedValue(new Error("dom error"));

    await expect(buildRecipe(makeRequest(), { client })).rejects.toThrow("dom error");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("recipe contains navigation step as first step", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    const firstStep = result.connector_spec.recipe.steps[0];
    expect(firstStep?.action.type).toBe("navigate");
    expect((firstStep?.action as { url: string }).url).toBe("https://toasttab.com");
  });

  it("recipe includes login steps when login capability requested", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    const { steps } = result.connector_spec.recipe;
    const types = steps.map((s) => s.action.type);
    expect(types).toContain("fill");
    expect(types).toContain("submit");
  });

  it("recipe requiredEnv includes login credentials", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    expect(result.connector_spec.recipe.requiredEnv).toContain("SERVICE_EMAIL");
    expect(result.connector_spec.recipe.requiredEnv).toContain("SERVICE_PASSWORD");
  });

  it("recipe selectors are deduplicated", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    const { selectors } = result.connector_spec.recipe;
    const unique = [...new Set(selectors)];
    expect(selectors.length).toBe(unique.length);
  });

  it("recipe service name matches request", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest("Vagaro"), { client });

    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    expect(result.connector_spec.recipe.service).toBe("Vagaro");
  });

  it("confidence is between 0 and 1", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("evidence contains at least one hit entry from dom-snapshot", async () => {
    const client = makeMockClient();
    const result = await buildRecipe(makeRequest(), { client });

    const domEv = result.evidence.find((e) => e.source === "dom-snapshot");
    expect(domEv).toBeDefined();
    expect(domEv?.outcome).toBe("hit");
  });

  it("works with empty DOM (generates minimal steps)", async () => {
    const client = makeMockClient([]);
    const result = await buildRecipe(makeRequest(), { client });

    expect(result.tier).toBe(4);
    if (result.connector_spec.kind !== "recipe") throw new Error("wrong kind");
    expect(result.connector_spec.recipe.steps.length).toBeGreaterThan(0);
  });
});
