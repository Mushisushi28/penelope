/**
 * MarketingScheduler — fires generatePost on a tenant-configured cadence.
 *
 * Configuration (from tenant.json → marketing):
 *   cadence: "3/week"  — posts per week (or "1/day", "2/week", etc.)
 *   preferred_time_local: "10:30"  — local wall-clock time to trigger
 *   timezone: from tenant.json → hours.timezone
 *
 * The scheduler is lightweight: it computes whether it should fire on a given
 * call and is designed to be called from an external cron (e.g. a Windows
 * Task Scheduler or loom-a2a cron that fires every 15 minutes).
 *
 * Cron pattern for Windows Task Scheduler / loom-a2a:
 *   Schedule: every 15 minutes during business hours
 *   Command:  node dist/specialists/marketing-scheduler.js
 *
 * The scheduler writes a `.last-fired` marker into the state dir to prevent
 * duplicate triggers on the same day.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MarketingSpecialist, type MarketingConfig } from "./marketing.js";
import type { SpecialistConfig } from "./base.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerConfig extends SpecialistConfig {
  tenants_root: string;
  marketing: MarketingConfig & { timezone: string };
  vertical: string;
  business_context: string;
  model?: string;
}

export interface SchedulerState {
  last_fired_date?: string; // YYYY-MM-DD
  fires_this_week: number;
  week_start?: string; // ISO Monday of the current week
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse cadence string (e.g. "3/week", "1/day", "2/week") into a
 * { count, period } pair.
 */
export function parseCadence(cadence: string): { count: number; period: "day" | "week" } {
  const match = cadence.match(/^(\d+)\/(day|week)$/);
  if (!match) {
    throw new Error(
      `[MarketingScheduler] Invalid cadence "${cadence}". Expected format: "N/day" or "N/week".`,
    );
  }
  return {
    count: parseInt(match[1]!, 10),
    period: match[2] as "day" | "week",
  };
}

/**
 * Get the ISO date string (YYYY-MM-DD) for the Monday of the current week
 * in UTC (good enough for cadence tracking; real tz offset handled by preferred_time).
 */
export function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Return today's date as YYYY-MM-DD in UTC.
 */
export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Check whether it's time to fire, given preferred_time_local and the current
 * hour (caller passes tz-adjusted hour, or we use UTC as a proxy).
 *
 * Fires if:
 *   1. Current hour matches preferred_time_local hour.
 *   2. Has not already fired today (checked via state.last_fired_date).
 *   3. Has not exceeded the cadence quota this period.
 */
export function shouldFire(
  state: SchedulerState,
  cadence: string,
  preferredHour: number,
  currentHour: number,
  today: string,
): boolean {
  if (currentHour !== preferredHour) return false;
  if (state.last_fired_date === today) return false;

  const { count, period } = parseCadence(cadence);

  if (period === "day") {
    return true; // at most 1 fire per day at preferredHour; count > 1/day not supported
  }

  // period === "week"
  const thisWeek = getMondayOfWeek(new Date(today));
  const stateWeek = state.week_start ?? "";
  const firesThisWeek = stateWeek === thisWeek ? state.fires_this_week : 0;

  // Distribute evenly: fire on Mon/Wed/Fri for 3/week, Mon/Thu for 2/week, etc.
  const DOW_MAP: Record<number, number[]> = {
    1: [1],        // 1/week → Monday
    2: [1, 4],     // 2/week → Mon, Thu
    3: [1, 3, 5],  // 3/week → Mon, Wed, Fri
    5: [1, 2, 3, 4, 5], // 5/week → weekdays
    7: [0, 1, 2, 3, 4, 5, 6], // daily
  };
  const allowedDays = DOW_MAP[count] ?? Array.from({ length: count }, (_, i) => i + 1);
  const todayDow = new Date(today + "T12:00:00Z").getUTCDay();

  if (!allowedDays.includes(todayDow)) return false;
  return firesThisWeek < count;
}

// ─── MarketingScheduler ───────────────────────────────────────────────────────

export class MarketingScheduler {
  private readonly config: SchedulerConfig;
  private readonly specialist: MarketingSpecialist;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.specialist = new MarketingSpecialist({
      role: "marketing",
      tenant_id: config.tenant_id,
      tenants_root: config.tenants_root,
      marketing: config.marketing,
      model: config.model,
    });
  }

  private statePath(): string {
    return join(
      this.config.tenants_root,
      this.config.tenant_id,
      "state",
      "marketing-scheduler-state.json",
    );
  }

  private async readState(): Promise<SchedulerState> {
    const path = this.statePath();
    if (!existsSync(path)) return { fires_this_week: 0 };
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as SchedulerState;
  }

  private async writeState(state: SchedulerState): Promise<void> {
    const path = this.statePath();
    const dir = join(
      this.config.tenants_root,
      this.config.tenant_id,
      "state",
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  }

  /**
   * Tick — call this from your cron every 15 minutes.
   * Returns { fired: true, draft_id } if a post was generated, or { fired: false }.
   */
  async tick(now: Date = new Date()): Promise<{ fired: boolean; draft_id?: string }> {
    const state = await this.readState();
    const today = todayUTC(now);
    const preferredHour = parseInt(
      this.config.marketing.preferred_time_local.split(":")[0]!,
      10,
    );

    // Use UTC hour as proxy — for accurate tz support, convert now to local time first.
    const currentHour = now.getUTCHours();

    const fire = shouldFire(
      state,
      this.config.marketing.cadence,
      preferredHour,
      currentHour,
      today,
    );

    if (!fire) return { fired: false };

    const post = await this.specialist.generatePost({
      vertical: this.config.vertical,
      business_context: this.config.business_context,
    });

    const draft_id = await this.specialist.queueForApproval(post);

    // Update scheduler state
    const thisWeek = getMondayOfWeek(now);
    const newFires =
      (state.week_start === thisWeek ? state.fires_this_week : 0) + 1;

    await this.writeState({
      last_fired_date: today,
      fires_this_week: newFires,
      week_start: thisWeek,
    });

    return { fired: true, draft_id };
  }
}
