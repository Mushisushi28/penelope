/**
 * Read-side API for the dashboard home panel.
 *
 * getTenantMetrics() is the primary entry point: given a tenant slug
 * and an optional time window, return a MetricsSnapshot.
 */

import * as path from "node:path";
import { TenantMeter } from "./meter.js";
import type { MetricsSnapshot } from "./meter.js";

export type { MetricsSnapshot };

export interface MetricsOptions {
  /** Window start. Defaults to 24h ago. */
  sinceMs?: number;
  /** Window end. Defaults to now. */
  untilMs?: number;
}

/**
 * Get a MetricsSnapshot for a tenant.
 *
 * @param slug      Tenant slug (used to locate the SQLite database).
 * @param tenantsDir  Root tenants directory (e.g. `process.cwd() + "/tenants"`).
 * @param opts      Optional time window.
 */
export function getTenantMetrics(
  slug: string,
  tenantsDir: string,
  opts: MetricsOptions = {}
): MetricsSnapshot {
  const stateDir = path.join(tenantsDir, slug, "state");
  const meter = new TenantMeter(slug, stateDir);
  try {
    return meter.snapshot(opts.sinceMs, opts.untilMs);
  } finally {
    meter.close();
  }
}

/**
 * Get metrics for multiple tenants at once (dashboard aggregate view).
 */
export function getMultiTenantMetrics(
  slugs: string[],
  tenantsDir: string,
  opts: MetricsOptions = {}
): MetricsSnapshot[] {
  return slugs.map((slug) => getTenantMetrics(slug, tenantsDir, opts));
}
