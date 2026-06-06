/**
 * Shape-validation tests for the Wave-1 MCP connector registry.
 * All tests are pure data — no MCP server spawning, no real credentials.
 */

import { describe, it, expect } from "vitest";
import {
  mcpRegistry,
  getMCPByCategory,
  getMCPById,
} from "../mcp-registry/index.js";
import type { MCPConnectorDescriptor } from "../mcp-registry/types.js";

describe("mcpRegistry", () => {
  it("contains exactly 27 connectors", () => {
    expect(mcpRegistry.length).toBe(27);
  });

  it("every connector has a non-empty id in kebab-case", () => {
    for (const c of mcpRegistry) {
      expect(c.id).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  it("all ids are unique", () => {
    const ids = mcpRegistry.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every connector has a non-empty vendor", () => {
    for (const c of mcpRegistry) {
      expect(c.vendor.length).toBeGreaterThan(0);
    }
  });

  it("every connector has at least one capability in verb.noun format", () => {
    for (const c of mcpRegistry) {
      expect(c.capabilities.length).toBeGreaterThan(0);
      for (const cap of c.capabilities) {
        expect(cap).toMatch(/^\w+\.\w+/);
      }
    }
  });

  it("owner_consent_required is a subset of capabilities", () => {
    for (const c of mcpRegistry) {
      for (const op of c.owner_consent_required) {
        expect(c.capabilities).toContain(op);
      }
    }
  });

  it("every connector has at least one required_env", () => {
    for (const c of mcpRegistry) {
      expect(c.required_env.length).toBeGreaterThan(0);
    }
  });

  it("every connector has a valid docs_url", () => {
    for (const c of mcpRegistry) {
      expect(c.docs_url).toMatch(/^https?:\/\//);
    }
  });

  it("registry_status is a known value", () => {
    const validStatuses = ["official", "community", "alpha", "beta", "TODO"];
    for (const c of mcpRegistry) {
      expect(validStatuses).toContain(c.registry_status);
    }
  });

  it("transport is a known value", () => {
    const validTransports = ["stdio", "sse", "http"];
    for (const c of mcpRegistry) {
      expect(validTransports).toContain(c.transport);
    }
  });

  it("tenant_config_template is a plain object", () => {
    for (const c of mcpRegistry) {
      expect(typeof c.tenant_config_template).toBe("object");
      expect(c.tenant_config_template).not.toBeNull();
    }
  });
});

describe("getMCPById", () => {
  it("returns the stripe connector by id", () => {
    const c = getMCPById("stripe");
    expect(c).toBeDefined();
    expect(c!.vendor).toBe("Stripe");
    expect(c!.category).toBe("payments");
  });

  it("returns hubspot connector", () => {
    const c = getMCPById("hubspot");
    expect(c).toBeDefined();
    expect(c!.registry_status).toBe("official");
  });

  it("returns undefined for unknown id", () => {
    expect(getMCPById("nonexistent-connector")).toBeUndefined();
  });
});

describe("getMCPByCategory", () => {
  it("returns at least one payments connector", () => {
    const results = getMCPByCategory("payments");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((c) => c.category === "payments")).toBe(true);
  });

  it("returns at least two crm connectors", () => {
    const results = getMCPByCategory("crm");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns at least two accounting connectors", () => {
    const results = getMCPByCategory("accounting");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns at least two helpdesk connectors", () => {
    const results = getMCPByCategory("helpdesk");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns at least two booking connectors", () => {
    const results = getMCPByCategory("booking");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for category with no connectors", () => {
    // 'ecommerce' has no Wave-1 connectors
    const results = getMCPByCategory("ecommerce");
    expect(results).toEqual([]);
  });
});

describe("P0 category coverage", () => {
  const p0Categories = [
    "payments",
    "crm",
    "inbox",
    "booking",
    "email-sms",
    "accounting",
    "reviews",
    "helpdesk",
    "voice-ai",
    "payroll",
  ] as const;

  for (const category of p0Categories) {
    it(`has at least one connector in P0 category: ${category}`, () => {
      const results = getMCPByCategory(category);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("owner_consent_required correctness", () => {
  it("stripe requires consent for payment.charge", () => {
    const c = getMCPById("stripe")!;
    expect(c.owner_consent_required).toContain("payment.charge");
  });

  it("stripe requires consent for payment.refund", () => {
    const c = getMCPById("stripe")!;
    expect(c.owner_consent_required).toContain("payment.refund");
  });

  it("klaviyo requires consent for email.send", () => {
    const c = getMCPById("klaviyo")!;
    expect(c.owner_consent_required).toContain("email.send");
  });

  it("vapi requires consent for call.create", () => {
    const c = getMCPById("vapi")!;
    expect(c.owner_consent_required).toContain("call.create");
  });

  it("xero requires consent for invoice.send", () => {
    const c = getMCPById("xero")!;
    expect(c.owner_consent_required).toContain("invoice.send");
  });

  it("gusto requires consent for payroll.run", () => {
    const c = getMCPById("gusto")!;
    expect(c.owner_consent_required).toContain("payroll.run");
  });

  it("hubspot read ops do NOT require consent", () => {
    const c = getMCPById("hubspot")!;
    expect(c.owner_consent_required).not.toContain("contact.list");
    expect(c.owner_consent_required).not.toContain("deal.list");
  });
});
