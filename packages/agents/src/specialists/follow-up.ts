/**
 * FollowUpSpecialist — re-engages dormant customers.
 *
 * Org-chart position:
 *   USER ←─── telegram-owner ───→ PENELOPE
 *                                      │
 *                              FollowUpSpecialist (bus only)
 *
 * This specialist NEVER touches telegram-owner. All candidate lists and drafted
 * messages are published to the loom-a2a internal bus and relayed to the owner
 * by Penelope.
 *
 * Hard constraints (baked into the implementation, not just docs):
 *   - Never send 2 follow-ups within 14 days for the same customer.
 *   - No proactive outbound past 22:00 local (defer to next 09:00).
 *   - Skip customers marked do-not-contact.
 *   - Skip customers whose last inbound contained opt-out language.
 */

import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SpecialistAgent, type SpecialistConfig } from "./base.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FollowUpStage =
  | "quoted_no_booking"
  | "booked_no_show"
  | "paid_rebook"
  | "first_dm_no_reply";

export interface CustomerThread {
  customer_id: string;
  customer_name?: string;
  channel: string;
  last_inbound_at?: string;   // ISO timestamp of customer's last inbound message
  last_outbound_at?: string;  // ISO timestamp of last outbound message
  last_followup_at?: string;  // ISO timestamp of last follow-up sent
  stage: FollowUpStage;
  do_not_contact?: boolean;
  last_inbound_text?: string; // raw text of customer's last inbound message (for sentiment check)
  quoted_at?: string;
  booked_at?: string;
  paid_at?: string;
  /** Arbitrary metadata (e.g. vehicle info, service type). */
  meta?: Record<string, unknown>;
}

export interface FollowUpDraft {
  draft_id: string;
  tenant_id: string;
  status: "pending" | "approved" | "published" | "rejected";
  created_at: string;
  approved_at?: string;
  published_at?: string;
  customer: CustomerThread;
  reason: FollowUpStage;
  message_text: string;
  /** Channel adapter key (e.g. "fb-page", "sms-textnow"). */
  channel: string;
}

export interface FollowUpConfig {
  enabled: boolean;
  min_days_silent: number;
  max_days_silent: number;
  approval_required: boolean;
  stages: FollowUpStage[];
}

export interface FindDormantOptions {
  min_days_silent: number;
  max_days_silent: number;
  stages?: FollowUpStage[];
  /** Inject a "current time" reference for deterministic tests. */
  now?: Date;
}

export interface FollowUpSpecialistConfig extends SpecialistConfig {
  /** Absolute path to the tenants root (e.g. /repo/tenants). */
  tenants_root: string;
  /** Follow-up config block from tenant.json. */
  followup: FollowUpConfig;
  /** Tenant vertical (e.g. "auto-service", "salon"). Used for voice selection. */
  vertical: string;
  /** Brand voice notes from tenant.json → brand.voice_notes. */
  voice_notes?: string;
  /** Business display name. */
  display_name?: string;
  /** Anthropic model to use for message drafting. */
  model?: string;
  /** Quiet-hours start (0–23). Defaults to 22. */
  quiet_start?: number;
  /** Quiet-hours end (0–23). Defaults to 9. */
  quiet_end?: number;
  /**
   * Channel adapter map — keyed by channel name.
   * Implementations must expose a single `send(customer_id, text): Promise<string>` method.
   * Default: stubs that return a placeholder delivery_id.
   */
  channelAdapters?: Record<string, ChannelSendAdapter>;
}

// ─── Channel adapter interface ──────────────────────────────────────────────────

export interface ChannelSendAdapter {
  send(customer_id: string, text: string): Promise<string>;
}

/** Stub adapter — used in dev and tests. */
export class StubChannelAdapter implements ChannelSendAdapter {
  readonly channel: string;
  constructor(channel: string) {
    this.channel = channel;
  }
  async send(customer_id: string, _text: string): Promise<string> {
    return `${this.channel}_stub_${customer_id}_${Date.now()}`;
  }
}

const DEFAULT_ADAPTERS: Record<string, () => ChannelSendAdapter> = {
  "fb-page": () => new StubChannelAdapter("fb-page"),
  "sms-textnow": () => new StubChannelAdapter("sms-textnow"),
  "sms-twilio": () => new StubChannelAdapter("sms-twilio"),
  "instagram-dm": () => new StubChannelAdapter("instagram-dm"),
};

// ─── Opt-out sentiment guard ──────────────────────────────────────────────────

const OPT_OUT_PATTERNS = [
  /\bno\s+thanks\b/i,
  /\bnot\s+interested\b/i,
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bremove\s+me\b/i,
  /\bdo\s+not\s+contact\b/i,
  /\bdon't\s+contact\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\boptout\b/i,
  /\bopt.out\b/i,
];

export function hasOptedOut(lastInboundText: string | undefined): boolean {
  if (!lastInboundText) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(lastInboundText));
}

// ─── Quiet-hours guard ────────────────────────────────────────────────────────

/**
 * Returns true if the current hour falls inside the quiet window.
 * Wraps midnight correctly (e.g. quietStart=22, quietEnd=9).
 */
export function isQuietHours(
  now: Date = new Date(),
  quietStart = 22,
  quietEnd = 9,
): boolean {
  const hour = now.getHours();
  if (quietStart > quietEnd) {
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

/**
 * Given a current datetime, return the next 09:00 local time as a Date.
 * Used to defer publishing until the quiet window ends.
 */
export function nextQuietEnd(now: Date = new Date(), quietEnd = 9): Date {
  const next = new Date(now);
  next.setHours(quietEnd, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// ─── Rate-limit guard ─────────────────────────────────────────────────────────

const RATE_LIMIT_DAYS = 14;

export function withinRateLimit(thread: CustomerThread, now: Date = new Date()): boolean {
  if (!thread.last_followup_at) return false;
  const lastFollowup = new Date(thread.last_followup_at);
  const diffMs = now.getTime() - lastFollowup.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < RATE_LIMIT_DAYS;
}

// ─── Voice selection ──────────────────────────────────────────────────────────

function voiceSystemPrompt(
  vertical: string,
  voiceNotes: string | undefined,
  displayName: string | undefined,
): string {
  const base =
    voiceNotes ??
    `You draft brief, friendly follow-up messages for a small business called ${displayName ?? "our business"}. 1-2 sentences, no fluff.`;

  const verticalGuide: Record<string, string> = {
    "auto-service":
      "lowercase, conversational, 1-2 sentences. mobile differentiator: 'we come to you'. no pushy follow-ups. offer, don't pressure.",
    salon:
      "warm, first-name basis. highlight seasonal offer or new service if available. friendly, not sales-y.",
    "home-services":
      "professional but friendly. lead with the season or a specific pain point. brief.",
    cleaning:
      "professional but friendly. lead with the season or a specific pain point. brief.",
  };

  const guide = verticalGuide[vertical] ?? "friendly and brief. no pressure.";
  return `You draft brief follow-up messages for a small business.\nVertical voice: ${guide}\nAdditional voice notes: ${base}\n\nRules:\n- 1-2 sentences maximum\n- no emojis unless brand explicitly uses them\n- no markdown syntax\n- no salesy openers ("we have a special offer…")\n- sound human, not automated`;
}

// ─── FollowUpSpecialist ───────────────────────────────────────────────────────

export class FollowUpSpecialist extends SpecialistAgent {
  private readonly config: FollowUpSpecialistConfig;
  private readonly anthropic: Anthropic;
  private readonly resolvedAdapters: Record<string, ChannelSendAdapter>;

  constructor(config: FollowUpSpecialistConfig) {
    super({ role: "follow-up", tenant_id: config.tenant_id });
    this.config = config;
    this.anthropic = new Anthropic();

    // Build the adapter map: caller-supplied overrides win, then defaults.
    const resolved: Record<string, ChannelSendAdapter> = {};
    for (const [key, factory] of Object.entries(DEFAULT_ADAPTERS)) {
      resolved[key] = factory();
    }
    if (config.channelAdapters) {
      for (const [key, adapter] of Object.entries(config.channelAdapters)) {
        resolved[key] = adapter;
      }
    }
    this.resolvedAdapters = resolved;
  }

  // ── Queue persistence ────────────────────────────────────────────────────────

  private queuePath(): string {
    return join(
      this.config.tenants_root,
      this.tenantId,
      "state",
      "followup-queue.json",
    );
  }

  private async readQueue(): Promise<FollowUpDraft[]> {
    const path = this.queuePath();
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as FollowUpDraft[];
  }

  private async writeQueue(drafts: FollowUpDraft[]): Promise<void> {
    const path = this.queuePath();
    const dir = join(this.config.tenants_root, this.tenantId, "state");
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(drafts, null, 2), "utf8");
  }

  // ── Threads persistence ──────────────────────────────────────────────────────

  private threadsPath(): string {
    return join(
      this.config.tenants_root,
      this.tenantId,
      "state",
      "customer-threads.json",
    );
  }

  async readThreads(): Promise<CustomerThread[]> {
    const path = this.threadsPath();
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CustomerThread[];
  }

  async writeThreads(threads: CustomerThread[]): Promise<void> {
    const path = this.threadsPath();
    const dir = join(this.config.tenants_root, this.tenantId, "state");
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(threads, null, 2), "utf8");
  }

  // ── Core: find dormant customers ─────────────────────────────────────────────

  /**
   * Scan all customer threads and return those that qualify for a follow-up.
   *
   * Filters applied:
   *   1. Stage must be in `opts.stages` (if specified).
   *   2. Days since last contact within [min_days_silent, max_days_silent].
   *   3. Not do-not-contact.
   *   4. Last inbound does not contain opt-out language.
   *   5. Not within the 14-day rate-limit window.
   */
  async findDormantCustomers(
    threads: CustomerThread[],
    opts: FindDormantOptions,
  ): Promise<CustomerThread[]> {
    const now = opts.now ?? new Date();
    const allowedStages = opts.stages ?? this.config.followup.stages;

    return threads.filter((thread) => {
      // Stage filter
      if (!allowedStages.includes(thread.stage)) return false;

      // DNC check
      if (thread.do_not_contact) return false;

      // Opt-out sentiment check
      if (hasOptedOut(thread.last_inbound_text)) return false;

      // Rate-limit check
      if (withinRateLimit(thread, now)) return false;

      // Silence-window check: use the most recent of inbound/outbound timestamps
      const lastContactIso = thread.last_inbound_at ?? thread.last_outbound_at;
      if (!lastContactIso) return false;

      const lastContact = new Date(lastContactIso);
      const diffMs = now.getTime() - lastContact.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      return diffDays >= opts.min_days_silent && diffDays <= opts.max_days_silent;
    });
  }

  // ── Core: draft follow-up ────────────────────────────────────────────────────

  async draftFollowUp(thread: CustomerThread, reason: FollowUpStage): Promise<string> {
    const systemPrompt = voiceSystemPrompt(
      this.config.vertical,
      this.config.voice_notes,
      this.config.display_name,
    );

    const contextLines: string[] = [
      `Customer name: ${thread.customer_name ?? "there"}`,
      `Stage: ${reason}`,
    ];

    if (reason === "quoted_no_booking" && thread.quoted_at) {
      contextLines.push(`Quoted on: ${thread.quoted_at}`);
    }
    if (reason === "booked_no_show" && thread.booked_at) {
      contextLines.push(`Missed appointment: ${thread.booked_at}`);
    }
    if (reason === "paid_rebook" && thread.paid_at) {
      contextLines.push(`Last paid: ${thread.paid_at}`);
    }
    if (thread.meta) {
      contextLines.push(`Context: ${JSON.stringify(thread.meta)}`);
    }

    const userMessage = `${contextLines.join("\n")}\n\nDraft a brief follow-up message. Return only the message text, nothing else.`;

    const response = await this.anthropic.messages.create({
      model: this.config.model ?? "claude-haiku-4-5",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";
    return raw.trim();
  }

  // ── Core: queue for approval ──────────────────────────────────────────────────

  async queueForApproval(draft: Omit<FollowUpDraft, "draft_id" | "status" | "created_at">): Promise<string> {
    const draft_id = randomUUID();
    const fullDraft: FollowUpDraft = {
      ...draft,
      draft_id,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const queue = await this.readQueue();
    queue.push(fullDraft);
    await this.writeQueue(queue);

    return draft_id;
  }

  // ── Core: approve ─────────────────────────────────────────────────────────────

  async approve(draft_id: string): Promise<void> {
    const queue = await this.readQueue();
    const idx = queue.findIndex((d) => d.draft_id === draft_id);
    if (idx === -1) {
      throw new Error(`[FollowUpSpecialist] Draft not found: ${draft_id}`);
    }
    queue[idx]!.status = "approved";
    queue[idx]!.approved_at = new Date().toISOString();
    await this.writeQueue(queue);
  }

  // ── Core: publish ─────────────────────────────────────────────────────────────

  /**
   * Send an approved draft via the correct channel adapter.
   *
   * Guards enforced at publish time:
   *   - Draft must have status "approved".
   *   - Current time must not be in quiet hours (defers otherwise with an error).
   *   - telegram-owner adapter is forbidden (throws via base class guard).
   */
  async publish(draft_id: string, now: Date = new Date()): Promise<{ delivery_id: string; published_at: string }> {
    // Quiet-hours guard
    const quietStart = this.config.quiet_start ?? 22;
    const quietEnd = this.config.quiet_end ?? 9;
    if (isQuietHours(now, quietStart, quietEnd)) {
      const resume = nextQuietEnd(now, quietEnd);
      throw new Error(
        `[FollowUpSpecialist] Quiet hours active — defer publish until ${resume.toISOString()}`,
      );
    }

    const queue = await this.readQueue();
    const draft = queue.find((d) => d.draft_id === draft_id);

    if (!draft) {
      throw new Error(`[FollowUpSpecialist] Draft not found: ${draft_id}`);
    }
    if (draft.status !== "approved") {
      throw new Error(
        `[FollowUpSpecialist] Draft ${draft_id} is not approved (status=${draft.status}). ` +
          "Call approve() before publish().",
      );
    }

    // telegram-owner guard
    if (draft.channel === "telegram-owner") {
      this.acquireTelegramOwnerAdapter();
    }

    const adapter = this.resolvedAdapters[draft.channel];
    if (!adapter) {
      throw new Error(
        `[FollowUpSpecialist] No adapter for channel "${draft.channel}". ` +
          `Available: ${Object.keys(this.resolvedAdapters).join(", ")}`,
      );
    }

    const delivery_id = await adapter.send(
      draft.customer.customer_id,
      draft.message_text,
    );

    const published_at = now.toISOString();

    // Update queue record
    const idx = queue.findIndex((d) => d.draft_id === draft_id);
    if (idx !== -1) {
      queue[idx]!.status = "published";
      queue[idx]!.published_at = published_at;
    }
    await this.writeQueue(queue);

    // Mark thread with last_followup_at
    await this.markThreadFollowUp(draft.customer.customer_id, published_at);

    return { delivery_id, published_at };
  }

  // ── Thread marking ────────────────────────────────────────────────────────────

  async markThreadFollowUp(customer_id: string, timestamp: string): Promise<void> {
    const threads = await this.readThreads();
    const idx = threads.findIndex((t) => t.customer_id === customer_id);
    if (idx !== -1) {
      threads[idx]!.last_followup_at = timestamp;
      await this.writeThreads(threads);
    }
  }

  // ── SpecialistAgent.run (bus entry point) ─────────────────────────────────────

  async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const action = payload["action"] as string | undefined;

    switch (action) {
      case "find_dormant": {
        const threads = await this.readThreads();
        const candidates = await this.findDormantCustomers(threads, {
          min_days_silent: (payload["min_days_silent"] as number) ?? this.config.followup.min_days_silent,
          max_days_silent: (payload["max_days_silent"] as number) ?? this.config.followup.max_days_silent,
          stages: payload["stages"] as FollowUpStage[] | undefined,
        });
        return { candidates };
      }

      case "draft": {
        const customer = payload["customer"] as CustomerThread;
        const reason = (payload["reason"] as FollowUpStage) ?? customer.stage;
        const message_text = await this.draftFollowUp(customer, reason);
        const channel = (payload["channel"] as string) ?? customer.channel;
        const draft_id = await this.queueForApproval({
          tenant_id: this.tenantId,
          customer,
          reason,
          message_text,
          channel,
        });
        return { draft_id, message_text };
      }

      case "approve": {
        const draft_id = payload["draft_id"] as string;
        await this.approve(draft_id);
        return { ok: true, draft_id };
      }

      case "publish": {
        const draft_id = payload["draft_id"] as string;
        const result = await this.publish(draft_id);
        return { ok: true, ...result };
      }

      default:
        throw new Error(
          `[FollowUpSpecialist] Unknown action "${action}". Expected: find_dormant | draft | approve | publish`,
        );
    }
  }
}
