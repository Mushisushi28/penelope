/**
 * ContentScheduler — daily photo sorting tick.
 *
 * Designed to be called from an external cron (e.g. Windows Task Scheduler
 * or loom-a2a cron firing at 03:00 UTC daily).
 *
 * On each tick it:
 *   1. Checks the once-per-day guard (safe to call multiple times).
 *   2. Runs sortDailyPhotos on the configured watch folder.
 *   3. Returns a summary of what was moved.
 *
 * Default schedule: 03:00 UTC (configurable via daily_sort_at_utc in tenant.json).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ContentSpecialist, type ContentSpecialistConfig, type SortResult, contentTodayUTC } from "./content.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ContentSchedulerState {
  last_run_at?: string;      // ISO timestamp of last tick
  last_run_date?: string;    // YYYY-MM-DD (UTC) of last tick
}

export interface ContentSchedulerRunResult {
  ran: boolean;
  sort_result?: SortResult;
  skipped_reason?: string;
}

// ─── ContentScheduler ──────────────────────────────────────────────────────────

export class ContentScheduler {
  private readonly config: ContentSpecialistConfig;
  private readonly specialist: ContentSpecialist;
  /**
   * The folder to scan on each tick.
   * Typically the phone-sync inbox or a watched download folder.
   */
  private readonly watchFolder: string;

  constructor(config: ContentSpecialistConfig, watchFolder: string) {
    this.config = config;
    this.specialist = new ContentSpecialist(config);
    this.watchFolder = watchFolder;
  }

  // ── State persistence ────────────────────────────────────────────────────────

  private statePath(): string {
    return join(
      this.config.tenants_root,
      this.config.tenant_id,
      'state',
      'content-scheduler-state.json',
    );
  }

  private async readState(): Promise<ContentSchedulerState> {
    const path = this.statePath();
    if (!existsSync(path)) return {};
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as ContentSchedulerState;
  }

  private async writeState(state: ContentSchedulerState): Promise<void> {
    const path = this.statePath();
    const dir = join(this.config.tenants_root, this.config.tenant_id, 'state');
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  /**
   * Run the daily sort. Safe to call multiple times — only fires once per UTC day.
   *
   * @param now    Inject a reference time for deterministic tests.
   * @param force  Skip the once-per-day guard (useful in tests).
   */
  async tick(
    now: Date = new Date(),
    force = false,
  ): Promise<ContentSchedulerRunResult> {
    if (!this.config.content.enabled) {
      return { ran: false, skipped_reason: 'content specialist disabled for this tenant' };
    }

    const state = await this.readState();
    const today = contentTodayUTC(now);

    if (!force && state.last_run_date === today) {
      return { ran: false, skipped_reason: 'already ran today' };
    }

    const sort_result = await this.specialist.sortDailyPhotos(this.watchFolder, { now });

    await this.writeState({
      last_run_at: now.toISOString(),
      last_run_date: today,
    });

    return { ran: true, sort_result };
  }
}
