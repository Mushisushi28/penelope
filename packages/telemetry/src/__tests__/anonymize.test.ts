import { describe, it, expect } from "vitest";
import { buildAnonymousPing, assertNoPii, hashSlug } from "../anonymize.js";
import type { MetricsSnapshot } from "../meter.js";

function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    tenant_id: "acme-auto-detailing",
    period_start: Date.now() - 86_400_000,
    period_end: Date.now(),
    messages_handled: 42,
    drafts_pending: 3,
    ai_tokens_used: 1500,
    channels_active: 2,
    uptime_hours: 8.5,
    captured_at: Date.now(),
    ...overrides,
  };
}

describe("buildAnonymousPing", () => {
  it("produces the exact documented schema (no extra fields)", () => {
    const ping = buildAnonymousPing(
      makeSnapshot(),
      "abc123def456789a",
      "0.1.0",
      "auto-detailing"
    );

    const keys = Object.keys(ping).sort();
    expect(keys).toEqual(
      [
        "channels_count",
        "install_id_hash",
        "messages_handled_24h",
        "schema",
        "uptime_h",
        "version",
        "vertical",
      ].sort()
    );
  });

  it("does not include tenant_id, tenant_slug, or any name field", () => {
    const ping = buildAnonymousPing(
      makeSnapshot(),
      "abc123def456789a",
      "0.1.0",
      "auto-detailing"
    );

    const jsonStr = JSON.stringify(ping);
    // Raw tenant id must not appear
    expect(jsonStr).not.toContain("acme-auto-detailing");
    // Draft content never leaked
    expect(jsonStr).not.toContain("drafts_pending");
    // Token count in aggregate is fine but individual messages are not
    expect(jsonStr).not.toContain("ai_tokens_used");
  });

  it("install_id_hash is 16 hex chars", () => {
    const ping = buildAnonymousPing(
      makeSnapshot(),
      "abc123def456789a",
      "0.1.0",
      "auto-detailing"
    );
    expect(ping.install_id_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("schema field is always 1", () => {
    const ping = buildAnonymousPing(
      makeSnapshot(),
      "abc123def456789a",
      "0.1.0",
      "retail"
    );
    expect(ping.schema).toBe(1);
  });

  it("uptime_h is rounded to 2 decimal places", () => {
    const ping = buildAnonymousPing(
      makeSnapshot({ uptime_hours: 8.123456 }),
      "abc123def456789a",
      "0.1.0",
      "auto-detailing"
    );
    const asString = ping.uptime_h.toFixed(10);
    // Should be 8.12, not 8.123456
    expect(ping.uptime_h).toBe(8.12);
    expect(asString.startsWith("8.12")).toBe(true);
  });
});

describe("assertNoPii", () => {
  it("passes clean objects", () => {
    expect(() =>
      assertNoPii({ install_id_hash: "abc", version: "0.1.0", channels_count: 2, schema: 1 })
    ).not.toThrow();
  });

  it("throws on email-like string values", () => {
    expect(() =>
      assertNoPii({ some_field: "user@example.com" })
    ).toThrow(/email/i);
  });

  it("throws on phone-like string values", () => {
    expect(() =>
      assertNoPii({ contact: "+1 403-555-1234" })
    ).toThrow(/phone/i);
  });

  it("throws if a key name contains a forbidden word", () => {
    expect(() =>
      assertNoPii({ customer_name: "John Smith" })
    ).toThrow(/customer_name/);
  });

  it("throws on nested forbidden fields", () => {
    expect(() =>
      assertNoPii({ meta: { draft_text: "hello" } })
    ).toThrow(/draft_text/);
  });

  it("is fine with numeric-only values", () => {
    expect(() =>
      assertNoPii({ channels_count: 5, uptime_h: 2.5 })
    ).not.toThrow();
  });
});

describe("hashSlug", () => {
  it("is deterministic", () => {
    expect(hashSlug("acme-auto")).toBe(hashSlug("acme-auto"));
  });

  it("differs for different inputs", () => {
    expect(hashSlug("acme-auto")).not.toBe(hashSlug("bob-plumbing"));
  });

  it("returns 12 hex chars", () => {
    expect(hashSlug("any-slug")).toMatch(/^[0-9a-f]{12}$/);
  });
});
