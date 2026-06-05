import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { install, promote, readAuditLog } from "../install.js";
import type { MarketplaceManifest } from "../types.js";

function makeSha(payload: Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

function makeManifest(overrides: Partial<MarketplaceManifest> = {}): MarketplaceManifest {
  const payload = Buffer.from("id: test-procedure\nname: Test\n");
  return {
    id: "test-procedure-v1",
    name: "Test Procedure",
    kind: "procedure",
    version: "1.0.0",
    author: "Test Author",
    license: "MIT",
    sha256: makeSha(payload),
    description: "A test procedure.",
    tags: ["test"],
    payloadUrl: "",
    createdAt: "2026-06-04T00:00:00Z",
    vertical: "test",
    avgTurns: 2,
    ...overrides,
  } as MarketplaceManifest;
}

describe("install()", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-marketplace-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes to sandbox/ by default", async () => {
    const payload = Buffer.from("id: test-procedure\nname: Test\n");
    const manifest = makeManifest();
    const result = await install(manifest, payload, { tenantId: "acme", tenantsRoot: tmpDir, sandbox: true, operator: "test-op" });
    expect(result.ok).toBe(true);
    expect(result.path).toContain("sandbox");
    expect(result.message).toContain("sandbox");
  });

  it("throws on SHA mismatch", async () => {
    const payload = Buffer.from("tampered content");
    const manifest = makeManifest({ sha256: "0".repeat(64) });
    await expect(install(manifest, payload, { tenantId: "acme", tenantsRoot: tmpDir, sandbox: true }))
      .rejects.toThrow("SHA-256 mismatch");
  });

  it("appends to audit log", async () => {
    const payload = Buffer.from("id: test-procedure\nname: Test\n");
    const manifest = makeManifest();
    await install(manifest, payload, { tenantId: "acme", tenantsRoot: tmpDir, sandbox: true, operator: "auditor" });
    const entries = await readAuditLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("install");
    expect(entries[0]?.operator).toBe("auditor");
    expect(entries[0]?.sandbox).toBe(true);
  });

  it("installs live when sandbox=false", async () => {
    const payload = Buffer.from("id: test-procedure\nname: Test\n");
    const manifest = makeManifest();
    const result = await install(manifest, payload, { tenantId: "acme", tenantsRoot: tmpDir, sandbox: false, operator: "op" });
    expect(result.path).toContain("live");
  });
});

describe("promote()", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-marketplace-promote-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("promotes sandbox to live with valid TOTP", async () => {
    const payload = Buffer.from("id: test-procedure\nname: Test\n");
    const manifest = makeManifest();
    await install(manifest, payload, { tenantId: "acme", tenantsRoot: tmpDir, sandbox: true });
    const result = await promote({ tenantId: "acme", tenantsRoot: tmpDir, manifest, totpCode: "123456", operator: "isaac" });
    expect(result.ok).toBe(true);
    expect(result.path).toContain("live");
    expect(result.message).toContain("Promoted");
  });

  it("rejects invalid TOTP code", async () => {
    const manifest = makeManifest();
    await expect(promote({ tenantId: "acme", tenantsRoot: tmpDir, manifest, totpCode: "bad", operator: "isaac" }))
      .rejects.toThrow("Invalid TOTP");
  });

  it("rejects promote when sandbox file is missing", async () => {
    const manifest = makeManifest();
    await expect(promote({ tenantId: "acme", tenantsRoot: tmpDir, manifest, totpCode: "654321" }))
      .rejects.toThrow("Sandbox file not found");
  });
});
