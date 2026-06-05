/**
 * PII anonymisation layer.
 *
 * Before any data leaves the machine the ping payload must pass through
 * anonymize(). This module is intentionally paranoid — it strips or hashes
 * every field that could identify a person or business.
 */

import * as crypto from "node:crypto";
import type { MetricsSnapshot } from "./meter.js";

/** The exact payload sent to telemetry.penelope.dev. No more, no less. */
export interface AnonymousPing {
  /** Stable install identifier — sha256(tenantId + salt), first 16 hex chars. */
  install_id_hash: string;
  /** Package version string. */
  version: string;
  /** Business vertical from tenant.json (e.g. "auto-detailing"). Never a name. */
  vertical: string;
  /** How many channels are active. */
  channels_count: number;
  /** Uptime hours in the reporting window. */
  uptime_h: number;
  /** Messages handled in the last 24h window. */
  messages_handled_24h: number;
  /** Schema version so the server can evolve parsing. */
  schema: 1;
}

/** Fields that MUST NOT appear in the outbound payload. */
const FORBIDDEN_FIELDS = [
  "tenant_id",
  "tenant_slug",
  // PII field name fragments — intentionally specific to avoid matching
  // legitimate aggregate fields like "messages_handled_24h".
  "customer_name",
  "customer_email",
  "customer_phone",
  "recipient_name",
  "draft_text",
  "draft_content",
  "message_body",
  "message_text",
  "message_content",
  "raw_content",
  "email_address",
  "phone_number",
  "full_name",
  "first_name",
  "last_name",
] as const;

/**
 * Build an anonymous ping from a MetricsSnapshot.
 * Throws if any forbidden field would leak.
 */
export function buildAnonymousPing(
  snapshot: MetricsSnapshot,
  installIdHash: string,
  version: string,
  vertical: string
): AnonymousPing {
  const ping: AnonymousPing = {
    install_id_hash: installIdHash,
    version,
    vertical,
    channels_count: snapshot.channels_active,
    uptime_h: Math.round(snapshot.uptime_hours * 100) / 100,
    messages_handled_24h: snapshot.messages_handled,
    schema: 1,
  };

  assertNoPii(ping);
  return ping;
}

/**
 * Guard: walk every value in the object and assert no string looks like PII.
 * This is defence-in-depth — the structure above already prevents leaks,
 * but this catches future coding mistakes.
 */
export function assertNoPii(obj: unknown, path = ""): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = path ? `${path}.${key}` : key;

      // Check key name against forbidden list
      for (const forbidden of FORBIDDEN_FIELDS) {
        if (key.toLowerCase().includes(forbidden)) {
          throw new Error(
            `PII guard: forbidden field "${fullPath}" found in outbound payload`
          );
        }
      }

      // Recurse into nested objects
      if (typeof value === "object") {
        assertNoPii(value, fullPath);
      }

      // Check string values for obvious PII patterns
      if (typeof value === "string") {
        assertStringNotPii(value, fullPath);
      }
    }
  }
}

const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { name: "phone (E.164)", re: /\+?1?\s?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ },
  // Full UUIDs are fine (install hashes etc), but slugs that look like names are not
  // Keep this lightweight — the structural guard above is the real barrier.
];

function assertStringNotPii(value: string, fieldPath: string): void {
  for (const { name, re } of PII_PATTERNS) {
    if (re.test(value)) {
      throw new Error(
        `PII guard: field "${fieldPath}" looks like ${name} — strip before sending`
      );
    }
  }
}

/** One-way hash for a slug. Used if vertical needs de-identification. */
export function hashSlug(slug: string): string {
  return crypto
    .createHash("sha256")
    .update(slug + "penelope-slug-salt-v1")
    .digest("hex")
    .slice(0, 12);
}
