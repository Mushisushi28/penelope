import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { TenantMeter } from "../meter.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "penelope-telemetry-test-"));
}

describe("TenantMeter", () => {
  let meter: TenantMeter;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    meter = new TenantMeter("test-tenant", dir);
  });

  afterEach(() => {
    meter.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts at zero for any counter", () => {
    expect(meter.get("messages_handled")).toBe(0);
    expect(meter.get("drafts_pending")).toBe(0);
  });

  it("increments by 1 by default", () => {
    meter.increment("messages_handled");
    expect(meter.get("messages_handled")).toBe(1);
    meter.increment("messages_handled");
    expect(meter.get("messages_handled")).toBe(2);
  });

  it("increments by arbitrary delta", () => {
    meter.increment("ai_tokens_used", 500);
    expect(meter.get("ai_tokens_used")).toBe(500);
    meter.increment("ai_tokens_used", 300);
    expect(meter.get("ai_tokens_used")).toBe(800);
  });

  it("set() overwrites the counter absolutely", () => {
    meter.increment("drafts_pending", 5);
    meter.set("drafts_pending", 2);
    expect(meter.get("drafts_pending")).toBe(2);
  });

  it("sumInWindow returns only events in the window", () => {
    const t0 = Date.now();
    meter.increment("messages_handled");
    meter.increment("messages_handled");

    // Window starting after the events — should be 0
    const sum = meter.sumInWindow("messages_handled", t0 + 10_000, t0 + 20_000);
    expect(sum).toBe(0);

    // Window containing the events
    const sum2 = meter.sumInWindow("messages_handled", t0 - 1000, t0 + 10_000);
    expect(sum2).toBe(2);
  });

  it("snapshot returns consistent MetricsSnapshot", () => {
    meter.increment("messages_handled", 3);
    meter.increment("ai_tokens_used", 100);
    meter.set("drafts_pending", 2);
    meter.set("channels_active", 1);

    const snap = meter.snapshot();

    expect(snap.tenant_id).toBe("test-tenant");
    expect(snap.messages_handled).toBe(3);
    expect(snap.ai_tokens_used).toBe(100);
    expect(snap.drafts_pending).toBe(2);
    expect(snap.channels_active).toBe(1);
    expect(snap.period_start).toBeLessThan(snap.period_end);
    expect(snap.captured_at).toBeGreaterThan(0);
  });

  it("snapshot with explicit window respects the window", () => {
    const before = Date.now();
    meter.increment("messages_handled", 5);
    const after = Date.now();

    // Snapshot covering 1 second around now
    const snap = meter.snapshot(before - 500, after + 500);
    expect(snap.messages_handled).toBe(5);

    // Snapshot in the past — should see 0
    const snapPast = meter.snapshot(before - 10_000, before - 5_000);
    expect(snapPast.messages_handled).toBe(0);
  });

  it("uptime tracks session time", async () => {
    const start = Date.now();
    meter.startSession();
    // Simulate 10ms of work
    await new Promise((r) => setTimeout(r, 10));
    meter.stopSession();
    const end = Date.now();

    const hours = meter.uptimeHoursInWindow(start - 1000, end + 1000);
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThan(0.01); // definitely less than 1 minute
  });

  it("installIdHash is stable and 16 hex chars", () => {
    const h1 = meter.installIdHash();
    const h2 = meter.installIdHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("installIdHash differs across tenants", () => {
    const dir2 = tmpDir();
    const meter2 = new TenantMeter("other-tenant", dir2);
    try {
      expect(meter.installIdHash()).not.toBe(meter2.installIdHash());
    } finally {
      meter2.close();
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("creates SQLite file on disk", () => {
    const dbPath = path.join(dir, "telemetry.sqlite");
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
