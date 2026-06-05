/**
 * @penelope/billing — daily metered usage collector
 *
 * Reads per-tenant usage from the provided store and reports incremental
 * counts to Stripe as metered billing records.
 *
 * Runs as a daily cron (caller is responsible for scheduling). Skips
 * tenants whose billing is disabled or have no subscription item ID.
 */

import { recordMeteredUsage } from "./stripe-client.js";
import type { MeteredUsage } from "./types.js";

export interface TenantMeterRecord {
  tenantId: string;
  /** Stripe subscription item ID for the metered price */
  subscriptionItemId: string;
  messagesHandled: number;
  channelsActive: number;
}

export interface CollectorResult {
  reported: number;
  skipped: number;
  errors: Array<{ tenantId: string; error: string }>;
}

/**
 * Reports metered usage for all provided tenant records to Stripe.
 *
 * @param records - tenant usage data for the current billing period
 * @param date - ISO date string (YYYY-MM-DD) for the report
 */
export async function collectAndReport(
  records: TenantMeterRecord[],
  date: string
): Promise<CollectorResult> {
  const result: CollectorResult = { reported: 0, skipped: 0, errors: [] };

  const timestamp = Math.floor(new Date(date).getTime() / 1000);

  for (const record of records) {
    if (!process.env["STRIPE_SECRET_KEY"]) {
      result.skipped += 1;
      continue;
    }

    if (!record.subscriptionItemId) {
      result.skipped += 1;
      continue;
    }

    if (record.messagesHandled === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      await recordMeteredUsage({
        subscriptionItemId: record.subscriptionItemId,
        quantity: record.messagesHandled,
        timestamp,
      });
      result.reported += 1;
    } catch (err) {
      result.errors.push({
        tenantId: record.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Builds a MeteredUsage snapshot from raw counts.
 * Useful for persisting daily snapshots alongside Stripe reporting.
 */
export function buildUsageSnapshot(
  tenantId: string,
  messages_handled: number,
  channels_active: number,
  date: string
): MeteredUsage {
  return { tenantId, date, messages_handled, channels_active };
}
