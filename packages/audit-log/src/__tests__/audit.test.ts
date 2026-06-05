import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { AuditLog, computeEntryHash } from "../append-only.js";
import { verifyEntries } from "../verify.js";
import { queryOutbound, auditTrailForCustomer } from "../query.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "penelope-audit-test-"));
}

function makeLog(dir: string, tenantId = "test-tenant"): AuditLog {
  return new AuditLog(tenantId, dir);
}

describe("AuditLog.append", () => {
  let dir: string;
  let log: AuditLog;

  beforeEach(() => {
    dir = tmpDir();
    log = makeLog(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes a JSONL file with a valid entry", () => {
    const entry = log.append({
      tenant_id: "test-tenant",
      channel: "sms",
      recipient_id: "+14035550001",
      content: "Your vehicle is ready!",
      message_type: "manual",
    });

    expect(entry.seq).toBe(1);
    expect(entry.prev_hash).toBe("GENESIS");
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.timestamp).toBeTruthy();
  });

  it("second entry chains from first", () => {
    const e1 = log.append({
      tenant_id: "test-tenant",
      channel: "sms",
      recipient_id: "+14035550001",
      content: "First message",
    });
    const e2 = log.append({
      tenant_id: "test-tenant",
      channel: "sms",
      recipient_id: "+14035550001",
      content: "Second message",
    });

    expect(e2.seq).toBe(2);
    expect(e2.prev_hash).toBe(e1.hash);
  });

  it("hash can be recomputed from entry fields", () => {
    const entry = log.append({
      tenant_id: "test-tenant",
      channel: "telegram",
      recipient_id: "user-123",
      content: "Hello from Penelope",
    });

    const recomputed = computeEntryHash(
      entry.seq,
      entry.timestamp,
      entry.tenant_id,
      entry.channel,
      entry.recipient_id,
      entry.content,
      entry.prev_hash
    );

    expect(recomputed).toBe(entry.hash);
  });

  it("entries are persisted to disk and re-readable", () => {
    log.append({ tenant_id: "test-tenant", channel: "sms", recipient_id: "+1", content: "A" });
    log.append({ tenant_id: "test-tenant", channel: "sms", recipient_id: "+1", content: "B" });

    // Re-open from disk
    const log2 = makeLog(dir);
    const today = new Date();
    const entries = log2.entriesForDate(today);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.content).toBe("A");
    expect(entries[1]?.content).toBe("B");
  });

  it("availableDates lists today", () => {
    log.append({ tenant_id: "test-tenant", channel: "sms", recipient_id: "+1", content: "X" });
    const dates = log.availableDates();
    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("verifyEntries", () => {
  let dir: string;
  let log: AuditLog;

  beforeEach(() => {
    dir = tmpDir();
    log = makeLog(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes a clean unmodified log", () => {
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "msg1" });
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "msg2" });
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "msg3" });

    const entries = log.entriesForDate(new Date());
    const result = verifyEntries("today", entries);

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalEntries).toBe(3);
  });

  it("detects hash mismatch when content is tampered", () => {
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "original" });
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+2", content: "second" });

    const entries = log.entriesForDate(new Date());
    // Tamper with first entry's content
    if (entries[0]) {
      entries[0] = { ...entries[0], content: "TAMPERED" };
    }

    const result = verifyEntries("today", entries);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.kind === "hash_mismatch")).toBe(true);
  });

  it("detects chain break when prev_hash is altered", () => {
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "a" });
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+1", content: "b" });

    const entries = log.entriesForDate(new Date());
    // Break the chain link
    if (entries[1]) {
      entries[1] = { ...entries[1], prev_hash: "0000000000000000" };
    }

    const result = verifyEntries("today", entries);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.kind === "chain_break" || e.kind === "hash_mismatch")).toBe(true);
  });

  it("passes empty log", () => {
    const result = verifyEntries("2026-01-01", []);
    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(0);
  });
});

describe("queryOutbound", () => {
  let dir: string;
  let log: AuditLog;

  beforeEach(() => {
    dir = tmpDir();
    log = makeLog(dir);
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+11", content: "hi", message_type: "manual" });
    log.append({ tenant_id: "t", channel: "telegram", recipient_id: "tg-99", content: "there", message_type: "auto-reply" });
    log.append({ tenant_id: "t", channel: "sms", recipient_id: "+11", content: "follow up" });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns all entries with no filters", () => {
    const { entries } = queryOutbound(log);
    expect(entries).toHaveLength(3);
  });

  it("filters by recipientId", () => {
    const { entries } = queryOutbound(log, { recipientId: "+11" });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.recipient_id === "+11")).toBe(true);
  });

  it("filters by channel", () => {
    const { entries } = queryOutbound(log, { channel: "telegram" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.channel).toBe("telegram");
  });

  it("filters by messageType", () => {
    const { entries } = queryOutbound(log, { messageType: "auto-reply" });
    expect(entries).toHaveLength(1);
  });

  it("respects limit", () => {
    const { entries } = queryOutbound(log, { limit: 1 });
    expect(entries).toHaveLength(1);
  });

  it("auditTrailForCustomer returns newest-first", () => {
    const trail = auditTrailForCustomer(log, "+11");
    expect(trail).toHaveLength(2);
    // Newest first — seq 3 then seq 1
    expect(trail[0]?.seq).toBeGreaterThan(trail[1]?.seq ?? 0);
  });
});
