/**
 * FollowUpScheduler — daily dormancy scan and candidate queuing.
 *
 * Designed to be called from an external cron (e.g. Windows Task Scheduler
 * or loom-a2a cron firing at 09:30 MDT daily).
 *
 * On each tick it:
 *   1. Reads all customer threads.
 *   2. Runs findDormantCustomers with the tenant's followup config.
 *   3. For each candidate, drafts a follow-up and queues it for approval.
 *   4. Returns a summary of what was queued.
 *
 * The scheduler avoids drafting duplicates: it checks whether the customer
 * already has a "pending" or "approved" draft in the queue before drafting
 * another one.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FollowUpSpecialist,
  type FollowUpSpecialistConfig,
  type FollowUpDraft,
} from "./follow-up.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SchedulerState {
  last_run_at?: string;   // ISO timestamp of last tick
  last_run_date?: string; // YYYY-MM-DD of last tick (UTC)
}

export interface SchedulerRunResult {
  ran: boolean;
  candidates_found: number;
  drafts_queued: string[];
  skipped_already_pending: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ─── FollowUpScheduler ─────────────────────────────────────────────────────────

export class FollowUpScheduler {
  private readonly config: FollowUpSpecialistConfig;
  private readonly specialist: FollowUpSpecialist;

  constructor(config: FollowUpSpecialistConfig) {
    this.config = config;
    this.specialist = new FollowUpSpecialist(config);
  }

  // ── State persistence ────────────────────────────────────────────────────────

  private statePath(): string {
    return join(
      this.config.tenants_root,
      this.config.tenant_id,
      "state",
      "followup-scheduler-state.json",
    );
  }

  private async readState(): Promise<SchedulerState> {
    const path = this.statePath();
    if (!existsSync(path)) return {};
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as SchedulerState;
  }

  private async writeState(state: SchedulerState): Promise<void> {
    const path = this.statePath();
    const dir = join(this.config.tenants_root, this.config.tenant_id, "state");
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  }

  // ── Pending-draft check ──────────────────────────────────────────────────────

  private async customersWithPendingDrafts(): Promise<Set<string>> {
    const queuePath = join(
      this.config.tenants_root,
      this.config.tenant_id,
      "state",
      "followup-queue.json",
    );
    if (!existsSync(queuePath)) return new Set();
    const raw = await readFile(queuePath, "utf8");
    const queue = JSON.parse(raw) as FollowUpDraft[];
    const pending = new Set<string>();
    for (const draft of queue) {
      if (draft.status === "pending" || draft.status === "approved") {
        pending.add(draft.customer.customer_id);
      }
    }
    return pending;
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  /**
   * Run the daily scan. Safe to call multiple times — only fires once per UTC day.
   *
   * @param now  Inject a reference time for deterministic tests.
   * @param force  Skip the once-per-day guard (useful in tests).
   */
  async tick(
    now: Date = new Date(),
    force = false,
  ): Promise<SchedulerRunResult> {
    if (!this.config.followup.enabled) {
      return {
        ran: false,
        candidates_found: 0,
        drafts_queued: [],
        skipped_already_pending: [],
      };
    }

    const state = await this.readState();
    const today = todayUTC(now);

    if (!force && state.last_run_date === today) {
      return {
        ran: false,
        candidates_found: 0,
        drafts_queued: [],
        skipped_already_pending: [],
      };
    }

    const threads = await this.specialist.readThreads();
    const candidates = await this.specialist.findDormantCustomers(threads, {
      min_days_silent: this.config.followup.min_days_silent,
      max_days_silent: this.config.followup.max_days_silent,
      stages: this.config.followup.stages,
      now,
    });

    const pendingSet = await this.customersWithPendingDrafts();
    const drafts_queued: string[] = [];
    const skipped_already_pending: string[] = [];

    for (const candidate of candidates) {
      if (pendingSet.has(candidate.customer_id)) {
        skipped_already_pending.push(candidate.customer_id);
        continue;
      }

      try {
        const message_text = await this.specialist.draftFollowUp(
          candidate,
          candidate.stage,
        );
        const draft_id = await this.specialist.queueForApproval({
          tenant_id: this.config.tenant_id,
          customer: candidate,
          reason: candidate.stage,
          message_text,
          channel: candidate.channel,
        });
        drafts_queued.push(draft_id);
      } catch {
        // Non-fatal: log and continue so one bad draft doesn't abort the scan.
        console.warn(
          `[FollowUpScheduler] Failed to draft for customer ${candidate.customer_id}`,
        );
      }
    }

    await this.writeState({
      last_run_at: now.toISOString(),
      last_run_date: today,
    });

    return {
      ran: true,
      candidates_found: candidates.length,
      drafts_queued,
      skipped_already_pending,
    };
  }
}
