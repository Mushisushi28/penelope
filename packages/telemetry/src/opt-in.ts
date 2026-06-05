/**
 * Optional aggregate ping to telemetry.penelope.dev.
 *
 * DEFAULT: OFF. Data is only sent when:
 *   1. tenant.json has `telemetry: true`
 *   2. A consent notice has been shown to the operator (first-ping gate)
 *
 * Payload schema (verbatim — inspect the source to verify):
 * {
 *   install_id_hash: string  // sha256(tenantId+salt)[0:16] — not reversible
 *   version: string          // package version
 *   vertical: string         // business type from tenant.json
 *   channels_count: number   // integer count of active channels
 *   uptime_h: number         // hours in reporting window, 2dp
 *   messages_handled_24h: number  // integer count
 *   schema: 1                // payload version
 * }
 *
 * NEVER in payload: customer names, draft text, phone numbers, email addresses,
 * tenant slug (hashed), IP addresses (server sees your IP — same as any HTTPS call).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildAnonymousPing } from "./anonymize.js";
import type { MetricsSnapshot } from "./meter.js";
import type { AnonymousPing } from "./anonymize.js";

export const TELEMETRY_ENDPOINT = "https://telemetry.penelope.dev/v1/ping";
export const PACKAGE_VERSION = "0.1.0";

export interface TenantConfig {
  telemetry?: boolean;
  vertical?: string;
  [key: string]: unknown;
}

export interface PingResult {
  sent: boolean;
  reason?: string;
  payload?: AnonymousPing;
  httpStatus?: number;
}

/** Path to the first-ping consent marker file. */
function consentMarkerPath(stateDir: string): string {
  return path.join(stateDir, "telemetry-consent-shown.flag");
}

/** True if consent notice has already been shown for this install. */
function hasShownConsent(stateDir: string): boolean {
  return fs.existsSync(consentMarkerPath(stateDir));
}

/** Record that consent notice was shown. */
function markConsentShown(stateDir: string): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(consentMarkerPath(stateDir), new Date().toISOString(), "utf8");
}

/**
 * Attempt to ping telemetry.penelope.dev with an anonymous payload.
 *
 * Returns a PingResult describing what happened (for logging). Never throws.
 */
export async function maybePing(
  snapshot: MetricsSnapshot,
  installIdHash: string,
  tenantConfig: TenantConfig,
  stateDir: string,
  onConsentNotice?: (payload: AnonymousPing) => void
): Promise<PingResult> {
  // Feature flag — default OFF.
  if (!tenantConfig.telemetry) {
    return { sent: false, reason: "telemetry disabled in tenant.json" };
  }

  const vertical = tenantConfig.vertical ?? "unknown";

  let payload: AnonymousPing;
  try {
    payload = buildAnonymousPing(snapshot, installIdHash, PACKAGE_VERSION, vertical);
  } catch (err) {
    return { sent: false, reason: `PII guard blocked: ${String(err)}` };
  }

  // First-ping consent gate.
  if (!hasShownConsent(stateDir)) {
    if (onConsentNotice) {
      onConsentNotice(payload);
    } else {
      // Default notice if no callback provided.
      console.info(
        "[penelope/telemetry] First opt-in ping. Payload (no PII):",
        JSON.stringify(payload, null, 2)
      );
    }
    markConsentShown(stateDir);
  }

  // Send the ping.
  try {
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    return { sent: true, payload, httpStatus: response.status };
  } catch (err) {
    // Network failure is not fatal — telemetry is optional.
    return { sent: false, reason: `network error: ${String(err)}`, payload };
  }
}
