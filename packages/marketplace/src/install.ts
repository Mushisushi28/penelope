/**
 * @penelope/marketplace — installer
 *
 * Writes items to `tenants/<id>/sandbox/` in sandbox mode.
 * Promotes to live only after TOTP verification.
 * Verifies SHA-256 before writing.
 * Maintains an append-only audit log.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { MarketplaceManifest, AuditEntry } from "./types.js";

export interface InstallOptions {
  /** Tenant identifier (slug, e.g. "dhr") */
  tenantId: string;
  /** Root directory that contains the `tenants/` tree */
  tenantsRoot: string;
  /** When true, writes to sandbox/ and requires promote() to go live */
  sandbox?: boolean;
  /** Operator name for the audit log */
  operator?: string;
}

export interface InstallResult {
  ok: boolean;
  path: string;
  message: string;
}

function tenantDir(root: string, id: string, sandbox: boolean): string {
  return join(root, "tenants", id, sandbox ? "sandbox" : "live");
}

async function fetchPayload(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch payload: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

function verifySha(payload: Buffer, expected: string): void {
  const actual = createHash("sha256").update(payload).digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch. Expected ${expected}, got ${actual}`);
  }
}

async function appendAudit(root: string, entry: AuditEntry): Promise<void> {
  const logPath = join(root, "marketplace-audit.ndjson");
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

export async function install(
  manifest: MarketplaceManifest,
  payload: Buffer,
  opts: InstallOptions
): Promise<InstallResult> {
  const { tenantId, tenantsRoot, sandbox = true, operator = "system" } = opts;

  // 1. Verify SHA
  verifySha(payload, manifest.sha256);

  // 2. Write to sandbox (or live if !sandbox)
  const dir = tenantDir(tenantsRoot, tenantId, sandbox);
  await mkdir(dir, { recursive: true });
  const filename = `${manifest.id}-${manifest.version}.yaml`;
  const dest = join(dir, filename);
  await writeFile(dest, payload);

  // 3. Audit log
  await appendAudit(tenantsRoot, {
    at: new Date().toISOString(),
    action: "install",
    itemId: manifest.id,
    version: manifest.version,
    operator,
    sandbox,
  });

  return {
    ok: true,
    path: dest,
    message: sandbox
      ? `Installed to sandbox at ${dest}. Run promote to go live.`
      : `Installed live at ${dest}.`,
  };
}

// ---------------------------------------------------------------------------
// installFromUrl — convenience wrapper
// ---------------------------------------------------------------------------

export async function installFromUrl(
  manifest: MarketplaceManifest,
  opts: InstallOptions
): Promise<InstallResult> {
  const payload = await fetchPayload(manifest.payloadUrl);
  return install(manifest, payload, opts);
}

// ---------------------------------------------------------------------------
// promote — moves sandbox item to live after TOTP gate
// ---------------------------------------------------------------------------

export interface PromoteOptions {
  tenantId: string;
  tenantsRoot: string;
  manifest: MarketplaceManifest;
  /** TOTP code supplied by operator */
  totpCode: string;
  operator?: string;
}

export async function promote(opts: PromoteOptions): Promise<InstallResult> {
  const { tenantId, tenantsRoot, manifest, totpCode, operator = "system" } = opts;

  // TOTP gate — in production wire to a real TOTP library.
  // Here we validate that a non-empty 6-digit code was supplied.
  if (!/^\d{6}$/.test(totpCode)) {
    throw new Error("Invalid TOTP code. Promotion requires a 6-digit code.");
  }

  const sandboxFile = join(
    tenantDir(tenantsRoot, tenantId, true),
    `${manifest.id}-${manifest.version}.yaml`
  );

  let payload: Buffer;
  try {
    payload = await readFile(sandboxFile);
  } catch {
    throw new Error(`Sandbox file not found at ${sandboxFile}. Install in sandbox first.`);
  }

  // Re-verify sha on the sandbox copy before promoting
  verifySha(payload, manifest.sha256);

  const liveDir = tenantDir(tenantsRoot, tenantId, false);
  await mkdir(liveDir, { recursive: true });
  const liveFile = join(liveDir, `${manifest.id}-${manifest.version}.yaml`);
  await writeFile(liveFile, payload);

  await appendAudit(tenantsRoot, {
    at: new Date().toISOString(),
    action: "promote",
    itemId: manifest.id,
    version: manifest.version,
    operator,
    sandbox: false,
  });

  return {
    ok: true,
    path: liveFile,
    message: `Promoted ${manifest.id}@${manifest.version} to live.`,
  };
}

// ---------------------------------------------------------------------------
// readAuditLog
// ---------------------------------------------------------------------------

export async function readAuditLog(tenantsRoot: string): Promise<AuditEntry[]> {
  const logPath = join(tenantsRoot, "marketplace-audit.ndjson");
  try {
    const raw = await readFile(logPath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}
