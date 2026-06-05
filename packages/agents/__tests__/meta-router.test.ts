import { describe, it, expect } from "vitest";
import { route, INTENTS } from "../src/owner-agent/meta-router.js";

const TENANT = "test-tenant";

describe("meta-router intent matching", () => {
  // Daily brief
  it("matches 'what's today look like'", () => {
    const r = route("what's today look like", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("daily-brief");
  });

  it("matches 'morning brief'", () => {
    const r = route("morning brief", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("daily-brief");
  });

  it("matches 'summary'", () => {
    const r = route("summary", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("daily-brief");
  });

  it("matches 'catch me up'", () => {
    const r = route("catch me up", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("daily-brief");
  });

  // Customer send
  it("matches 'send linnell the quote'", () => {
    const r = route("send linnell the quote we drafted", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("customer-frontend");
      expect(r.intent.action).toBe("send");
      expect(r.args["customer"]).toBe("linnell");
    }
  });

  // Quote builder
  it("matches 'draft a quote for a 2018 silverado pair'", () => {
    const r = route("draft a quote for a 2018 silverado pair, heavy oxidation", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("quote-builder");
      expect(r.args["jobDescription"]).toContain("silverado");
    }
  });

  it("matches 'quote for single car light condition'", () => {
    const r = route("quote for single car light condition", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("quote-builder");
  });

  // Autopilot
  it("matches 'pause autopilot'", () => {
    const r = route("pause autopilot for the day", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("tenant-state");
      expect(r.intent.action).toBe("pause");
    }
  });

  it("matches 'resume autopilot'", () => {
    const r = route("resume autopilot", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.action).toBe("resume");
  });

  it("matches 'turn off autopilot'", () => {
    const r = route("turn off autopilot", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.action).toBe("pause");
  });

  // Inbox check
  it("matches 'who just texted'", () => {
    const r = route("who just texted, new customer?", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("customer-frontend");
      expect(r.intent.action).toBe("inbox");
    }
  });

  it("matches 'new message'", () => {
    const r = route("new message", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.action).toBe("inbox");
  });

  // Booking
  it("matches 'book john for friday'", () => {
    const r = route("book john for friday at 2pm", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("booking");
      expect(r.args["customer"]).toBe("john");
    }
  });

  // Marketing
  it("matches 'draft a post for summer promo'", () => {
    const r = route("draft a post for summer promo", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("marketing");
      expect(r.intent.action).toBe("draft");
    }
  });

  it("matches 'draft a reel'", () => {
    const r = route("draft a reel", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("marketing");
  });

  // Payment reconcile
  it("matches 'what's owed'", () => {
    const r = route("what's owed", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("payment-reconciler");
  });

  it("matches 'reconcile'", () => {
    const r = route("reconcile", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.intent.specialist).toBe("payment-reconciler");
  });

  // Review ask
  it("matches 'send review ask to sarah'", () => {
    const r = route("send review ask to sarah", TENANT);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.intent.specialist).toBe("review-ask");
      expect(r.args["customer"]).toBe("sarah");
    }
  });

  // No match
  it("returns no match for unrecognised input", () => {
    const r = route("what's the weather like today", TENANT);
    expect(r.matched).toBe(false);
    if (!r.matched) expect(r.fallback).toBe("owner-agent-self");
  });

  it("returns no match for empty string", () => {
    const r = route("", TENANT);
    expect(r.matched).toBe(false);
  });

  // Coverage
  it("has at least 10 intents defined", () => {
    expect(INTENTS.length).toBeGreaterThanOrEqual(10);
  });
});
