/**
 * FollowUpSpecialist + FollowUpScheduler unit tests.
 * All Anthropic API calls and file I/O that reaches state are mocked or
 * exercised against a tmp dir, so no real API keys are needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

import {
  FollowUpSpecialist,
  hasOptedOut,
  isQuietHours,
  withinRateLimit,
  StubChannelAdapter,
  type FollowUpSpecialistConfig,
  type CustomerThread,
  type FollowUpStage,
} from "../specialists/follow-up.js";
import { FollowUpScheduler } from "../specialists/follow-up-scheduler.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpRoot: string;

function makeTmpRoot(): string {
  const dir = join(tmpdir(), `penelope-followup-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeConfig(
  overrides: Partial<FollowUpSpecialistConfig> = {},
): FollowUpSpecialistConfig {
  return {
    role: "follow-up",
    tenant_id: "test-tenant",
    tenants_root: tmpRoot,
    vertical: "auto-service",
    voice_notes: "lowercase, conversational",
    display_name: "Test Business",
    followup: {
      enabled: true,
      min_days_silent: 7,
      max_days_silent: 180,
      approval_required: true,
      stages: ["quoted_no_booking", "booked_no_show", "paid_rebook", "first_dm_no_reply"],
    },
    ...overrides,
  };
}

function makeThread(overrides: Partial<CustomerThread> = {}): CustomerThread {
  return {
    customer_id: "cust-001",
    customer_name: "Jordan",
    channel: "fb-page",
    stage: "quoted_no_booking" as FollowUpStage,
    ...overrides,
  };
}

/** Returns an ISO timestamp N days ago from a given reference time. */
function daysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// ─── Mock Anthropic SDK ───────────────────────────────────────────────────────

vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "hey, still thinking about getting those headlights sorted? we come to you." }],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  tmpRoot = makeTmpRoot();
  vi.clearAllMocks();
});

// 1. findDormantCustomers correctly stratifies by silence window
describe("findDormantCustomers — silence window stratification", () => {
  it("returns threads silent within [min, max] days", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({ customer_id: "c1", last_inbound_at: daysAgo(10, now) }), // in window
      makeThread({ customer_id: "c2", last_inbound_at: daysAgo(3, now) }),  // too recent
      makeThread({ customer_id: "c3", last_inbound_at: daysAgo(200, now) }), // too old
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      now,
    });

    expect(result.map((t) => t.customer_id)).toEqual(["c1"]);
  });

  it("includes threads at exactly min_days_silent boundary", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({ customer_id: "exact", last_inbound_at: daysAgo(7, now) }),
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.customer_id).toBe("exact");
  });

  it("filters by requested stages", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({ customer_id: "q1", stage: "quoted_no_booking", last_inbound_at: daysAgo(10, now) }),
      makeThread({ customer_id: "p1", stage: "paid_rebook", last_inbound_at: daysAgo(95, now) }),
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      stages: ["paid_rebook"],
      now,
    });

    expect(result.map((t) => t.customer_id)).toEqual(["p1"]);
  });
});

// 2. draftFollowUp respects vertical voice
describe("draftFollowUp — vertical voice", () => {
  it("calls Anthropic with auto-service system prompt containing mobile differentiator", async () => {
    const specialist = new FollowUpSpecialist(makeConfig({ vertical: "auto-service" }));
    const thread = makeThread();

    await specialist.draftFollowUp(thread, "quoted_no_booking");

    const anthropic = (Anthropic as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value as {
      messages: { create: ReturnType<typeof vi.fn> };
    };
    const call = anthropic.messages.create.mock.calls[0] as [{ system: string }];
    expect(call[0].system).toContain("we come to you");
  });

  it("returns the text from the LLM response", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());
    const text = await specialist.draftFollowUp(makeThread(), "quoted_no_booking");
    expect(text).toBe(
      "hey, still thinking about getting those headlights sorted? we come to you.",
    );
  });
});

// 3. 14-day rate limit prevents double follow-ups
describe("withinRateLimit — 14-day guard", () => {
  it("returns true when last followup was 10 days ago", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const thread = makeThread({ last_followup_at: daysAgo(10, now) });
    expect(withinRateLimit(thread, now)).toBe(true);
  });

  it("returns false when last followup was 15 days ago", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const thread = makeThread({ last_followup_at: daysAgo(15, now) });
    expect(withinRateLimit(thread, now)).toBe(false);
  });

  it("returns false when no last_followup_at is set", () => {
    const thread = makeThread();
    expect(withinRateLimit(thread)).toBe(false);
  });

  it("findDormantCustomers skips customers within rate-limit window", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({
        customer_id: "rate-limited",
        last_inbound_at: daysAgo(10, now),
        last_followup_at: daysAgo(5, now), // within 14 days
      }),
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      now,
    });

    expect(result).toHaveLength(0);
  });
});

// 4. DNC list respected
describe("DNC — do-not-contact flag", () => {
  it("findDormantCustomers skips DNC customers", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({
        customer_id: "dnc-cust",
        last_inbound_at: daysAgo(10, now),
        do_not_contact: true,
      }),
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      now,
    });

    expect(result).toHaveLength(0);
  });
});

// 5. Sentiment guard skips "no thanks" responders
describe("Sentiment guard — opt-out language", () => {
  it("hasOptedOut returns true for 'no thanks'", () => {
    expect(hasOptedOut("no thanks")).toBe(true);
  });

  it("hasOptedOut returns true for 'not interested'", () => {
    expect(hasOptedOut("i'm not interested in that")).toBe(true);
  });

  it("hasOptedOut returns true for 'stop'", () => {
    expect(hasOptedOut("stop messaging me")).toBe(true);
  });

  it("hasOptedOut returns false for a neutral message", () => {
    expect(hasOptedOut("maybe later, thanks")).toBe(false);
  });

  it("findDormantCustomers skips opt-out customers", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const threads: CustomerThread[] = [
      makeThread({
        customer_id: "opted-out",
        last_inbound_at: daysAgo(10, now),
        last_inbound_text: "no thanks i'm not interested",
      }),
    ];

    const result = await specialist.findDormantCustomers(threads, {
      min_days_silent: 7,
      max_days_silent: 180,
      now,
    });

    expect(result).toHaveLength(0);
  });
});

// 6. Quiet hours guard defers publish
describe("Quiet hours — publish deferral", () => {
  it("isQuietHours returns true at 23:00 with default window", () => {
    const night = new Date("2026-06-10T23:00:00");
    night.setHours(23);
    expect(isQuietHours(night, 22, 9)).toBe(true);
  });

  it("isQuietHours returns false at 10:00 with default window", () => {
    const morning = new Date("2026-06-10T10:00:00");
    morning.setHours(10);
    expect(isQuietHours(morning, 22, 9)).toBe(false);
  });

  it("publish throws during quiet hours with defer timestamp", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());

    // Create a pre-approved draft in the queue
    const thread = makeThread();
    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: thread,
      reason: "quoted_no_booking",
      message_text: "test message",
      channel: "fb-page",
    });
    await specialist.approve(draft_id);

    // Try to publish at 23:00
    const night = new Date();
    night.setHours(23, 0, 0, 0);

    await expect(specialist.publish(draft_id, night)).rejects.toThrow(
      "Quiet hours active",
    );
  });
});

// 7. Approval queue persistence
describe("Approval queue persistence", () => {
  it("queueForApproval writes a pending draft to disk", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());
    const thread = makeThread();

    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: thread,
      reason: "quoted_no_booking",
      message_text: "hey, follow up message",
      channel: "fb-page",
    });

    expect(typeof draft_id).toBe("string");

    // Re-instantiate to prove persistence
    const specialist2 = new FollowUpSpecialist(makeConfig());
    const result = await specialist2.run({ action: "approve", draft_id });
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("approve() sets status to approved and records approved_at", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());
    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: makeThread(),
      reason: "quoted_no_booking",
      message_text: "msg",
      channel: "fb-page",
    });

    await specialist.approve(draft_id);

    // Read raw queue to verify
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(
      join(tmpRoot, "test-tenant", "state", "followup-queue.json"),
      "utf8",
    );
    const queue = JSON.parse(raw) as Array<{ draft_id: string; status: string; approved_at?: string }>;
    const entry = queue.find((d) => d.draft_id === draft_id);
    expect(entry?.status).toBe("approved");
    expect(entry?.approved_at).toBeDefined();
  });
});

// 8. Publish routes to correct channel adapter (mocked)
describe("Publish — channel adapter routing", () => {
  it("calls the correct adapter's send() method", async () => {
    const mockSend = vi.fn().mockResolvedValue("fb_delivery_123");
    const specialist = new FollowUpSpecialist(
      makeConfig({
        channelAdapters: {
          "fb-page": { send: mockSend },
        },
      }),
    );

    const thread = makeThread({ channel: "fb-page" });
    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: thread,
      reason: "quoted_no_booking",
      message_text: "hey there",
      channel: "fb-page",
    });
    await specialist.approve(draft_id);

    const daytime = new Date();
    daytime.setHours(10, 0, 0, 0);
    const result = await specialist.publish(draft_id, daytime);

    expect(mockSend).toHaveBeenCalledWith("cust-001", "hey there");
    expect(result.delivery_id).toBe("fb_delivery_123");
  });

  it("StubChannelAdapter returns a placeholder delivery_id", async () => {
    const stub = new StubChannelAdapter("fb-page");
    const id = await stub.send("cust-001", "test");
    expect(id).toMatch(/^fb-page_stub_cust-001_/);
  });
});

// 9. Marks thread with last_followup_at on publish
describe("Thread marking — last_followup_at", () => {
  it("sets last_followup_at on the thread after successful publish", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());

    // Seed a thread into state
    const thread = makeThread({ customer_id: "mark-test" });
    await specialist.writeThreads([thread]);

    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: thread,
      reason: "quoted_no_booking",
      message_text: "hey there",
      channel: "fb-page",
    });
    await specialist.approve(draft_id);

    const daytime = new Date();
    daytime.setHours(10, 0, 0, 0);
    await specialist.publish(draft_id, daytime);

    const threads = await specialist.readThreads();
    const updated = threads.find((t) => t.customer_id === "mark-test");
    expect(updated?.last_followup_at).toBeDefined();
  });
});

// 10. Specialist refuses telegram-owner adapter
describe("telegram-owner guard", () => {
  it("publish throws when channel is telegram-owner", async () => {
    const specialist = new FollowUpSpecialist(makeConfig());

    const draft_id = await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: makeThread({ channel: "telegram-owner" }),
      reason: "quoted_no_booking",
      message_text: "test",
      channel: "telegram-owner",
    });
    await specialist.approve(draft_id);

    const daytime = new Date();
    daytime.setHours(10, 0, 0, 0);

    await expect(specialist.publish(draft_id, daytime)).rejects.toThrow(
      "telegram-owner",
    );
  });
});

// 11. FollowUpScheduler — daily tick integration
describe("FollowUpScheduler", () => {
  it("runs tick and queues a draft for a dormant candidate", async () => {
    const now = new Date("2026-06-10T09:30:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());

    const thread = makeThread({
      customer_id: "sched-cust",
      last_inbound_at: daysAgo(10, now),
    });
    await specialist.writeThreads([thread]);

    const scheduler = new FollowUpScheduler(makeConfig());
    const result = await scheduler.tick(now, true);

    expect(result.ran).toBe(true);
    expect(result.candidates_found).toBe(1);
    expect(result.drafts_queued).toHaveLength(1);
  });

  it("does not fire twice on the same UTC day", async () => {
    const now = new Date("2026-06-10T09:30:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());
    await specialist.writeThreads([
      makeThread({ customer_id: "once-cust", last_inbound_at: daysAgo(10, now) }),
    ]);

    const scheduler = new FollowUpScheduler(makeConfig());
    const first = await scheduler.tick(now, true);
    // Second call same day, no force
    const second = await scheduler.tick(now, false);

    expect(first.ran).toBe(true);
    expect(second.ran).toBe(false);
  });

  it("skips customers with a pending draft already in queue", async () => {
    const now = new Date("2026-06-10T09:30:00Z");
    const specialist = new FollowUpSpecialist(makeConfig());
    const thread = makeThread({
      customer_id: "already-pending",
      last_inbound_at: daysAgo(10, now),
    });
    await specialist.writeThreads([thread]);

    // Pre-queue a pending draft
    await specialist.queueForApproval({
      tenant_id: "test-tenant",
      customer: thread,
      reason: "quoted_no_booking",
      message_text: "existing draft",
      channel: "fb-page",
    });

    const scheduler = new FollowUpScheduler(makeConfig());
    const result = await scheduler.tick(now, true);

    expect(result.skipped_already_pending).toContain("already-pending");
    expect(result.drafts_queued).toHaveLength(0);
  });
});
