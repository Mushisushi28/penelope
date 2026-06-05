import { describe, it, expect, beforeEach } from "vitest";
import { clear, all, byCategory, byTier } from "../registry.js";
import { seedConnectors } from "../seed-connectors.js";

describe("seedConnectors", () => {
  beforeEach(() => {
    clear();
    seedConnectors();
  });

  it("registers more than 80 connectors", () => {
    expect(all().length).toBeGreaterThanOrEqual(80);
  });

  it("has at least one connector per category", () => {
    const categories = new Set(all().map((c) => c.category));
    const expected = [
      "payments", "calendar", "email", "sms", "messaging", "crm",
      "reviews", "pos", "accounting", "ads", "social", "forms",
      "bookings", "inventory", "shipping", "maps", "files",
      "esign", "support", "website", "domains",
    ];
    for (const cat of expected) {
      expect(categories.has(cat as never), `missing category: ${cat}`).toBe(true);
    }
  });

  it("has connectors in every tier", () => {
    const tiers = new Set(all().map((c) => c.tier));
    expect(tiers.has("mcp")).toBe(true);
    expect(tiers.has("api-skill")).toBe(true);
    expect(tiers.has("hermes-openapi")).toBe(true);
    expect(tiers.has("browser")).toBe(true);
  });

  it("stripe is tier mcp", () => {
    const stripe = all().find((c) => c.id === "stripe");
    expect(stripe?.tier).toBe("mcp");
    expect(stripe?.category).toBe("payments");
  });

  it("google-business-profile is tier browser", () => {
    const gbp = all().find((c) => c.id === "google-business-profile");
    expect(gbp?.tier).toBe("browser");
    expect(gbp?.category).toBe("reviews");
  });

  it("facebook-page is api-skill in messaging", () => {
    const fb = all().find((c) => c.id === "facebook-page");
    expect(fb?.tier).toBe("api-skill");
    expect(fb?.category).toBe("messaging");
  });

  it("byCategory payments returns at least 3", () => {
    expect(byCategory("payments").length).toBeGreaterThanOrEqual(3);
  });

  it("byTier hermes-openapi returns majority of connectors", () => {
    const hermes = byTier("hermes-openapi");
    expect(hermes.length).toBeGreaterThan(30);
  });

  it("all connectors have required fields", () => {
    for (const c of all()) {
      expect(c.id, "missing id").toBeTruthy();
      expect(c.displayName, `missing displayName for ${c.id}`).toBeTruthy();
      expect(c.tier, `missing tier for ${c.id}`).toBeTruthy();
      expect(c.category, `missing category for ${c.id}`).toBeTruthy();
      expect(Array.isArray(c.capabilities), `capabilities not array for ${c.id}`).toBe(true);
    }
  });
});
