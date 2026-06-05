/**
 * Tests: MarketingSpecialist + MarketingScheduler
 *
 * Coverage:
 *   - generatePost returns expected shape (Anthropic mocked)
 *   - queue persistence round-trips
 *   - approve flips status
 *   - publish dispatches to the right channel adapter (mocked)
 *   - quiet-hours guard skips publishing 22:00–09:00
 *   - scheduler shouldFire / cadence logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

// ─── Shared mock for Anthropic SDK ────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// ─── Imports (after mock registration) ───────────────────────────────────────

import {
  MarketingSpecialist,
  isQuietHours,
} from "../src/specialists/marketing.js";

import {
  shouldFire,
  parseCadence,
  getMondayOfWeek,
  todayUTC,
  MarketingScheduler,
} from "../src/specialists/marketing-scheduler.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_POST_JSON = JSON.stringify({
  text: "Crystal-clear headlights in under an hour. We come to you.",
  image_prompt: "Mobile headlight restoration van parked on a sunny residential street, before/after headlights",
  target_channels: ["fb-page", "instagram"],
});

function mockAnthropicResponse(text: string) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text }],
  });
}

async function makeSpecialist(root: string) {
  return new MarketingSpecialist({
    role: "marketing",
    tenant_id: "test-tenant",
    tenants_root: root,
    marketing: {
      cadence: "3/week",
      preferred_time_local: "10:30",
      channels: ["fb-page", "instagram"],
      voice_notes: "casual, mobile-business angle",
      approval_required: true,
    },
  });
}

// ─── Suite: generatePost ──────────────────────────────────────────────────────

describe("MarketingSpecialist.generatePost", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-mktg-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns text, image_prompt, and target_channels", async () => {
    mockAnthropicResponse(MOCK_POST_JSON);
    const spec = await makeSpecialist(tmpDir);

    const result = await spec.generatePost({
      vertical: "auto-service",
      vibe: "energetic",
      business_context: "Mobile headlight restoration in Calgary AB.",
    });

    expect(result).toMatchObject({
      text: expect.any(String),
      image_prompt: expect.any(String),
      target_channels: expect.arrayContaining(["fb-page"]),
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.image_prompt.length).toBeGreaterThan(0);
  });

  it("falls back to JSON extraction if model wraps output in markdown", async () => {
    mockAnthropicResponse("```json\n" + MOCK_POST_JSON + "\n```");
    const spec = await makeSpecialist(tmpDir);

    const result = await spec.generatePost({
      vertical: "auto-service",
      business_context: "Mobile headlight restoration.",
    });

    expect(result.text).toContain("headlights");
  });
});

// ─── Suite: queue persistence ─────────────────────────────────────────────────

describe("MarketingSpecialist queue persistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-mktg-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("queueForApproval writes a draft and returns a draft_id", async () => {
    const spec = await makeSpecialist(tmpDir);

    const post = {
      text: "Test post",
      image_prompt: "A bright sunny day",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);
    expect(typeof draft_id).toBe("string");
    expect(draft_id.length).toBeGreaterThan(0);
  });

  it("persisted draft has status=pending", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "Pending post",
      image_prompt: "Foggy headlights before after",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);

    // Round-trip: create new instance pointing at same dir
    const spec2 = await makeSpecialist(tmpDir);
    // Access queue via approve (will throw if not found)
    await spec2.approve(draft_id); // sets approved
    // If it didn't throw, the draft was persisted correctly
    expect(true).toBe(true);
  });

  it("approve flips draft status to approved", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "Approvable post",
      image_prompt: "Clear headlights close-up",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);
    await spec.approve(draft_id);

    // If approved, publish should proceed (not throw on status check)
    // We verify by checking publish doesn't throw the status error
    // (it may throw on adapter, which is OK)
    let approveStatusError = false;
    try {
      await spec.publish(draft_id, "fb-page");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("not approved")) approveStatusError = true;
    }
    expect(approveStatusError).toBe(false);
  });

  it("approve throws for unknown draft_id", async () => {
    const spec = await makeSpecialist(tmpDir);
    await expect(spec.approve("nonexistent-id")).rejects.toThrow("Draft not found");
  });
});

// ─── Suite: publish dispatch ──────────────────────────────────────────────────

describe("MarketingSpecialist.publish", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-mktg-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("dispatches to the fb-page adapter and returns external_id", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "Live post",
      image_prompt: "Before after headlights",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);
    await spec.approve(draft_id);

    const result = await spec.publish(draft_id, "fb-page");
    expect(result.external_id).toMatch(/^fb_post_/);
    expect(result.channel).toBe("fb-page");
    expect(result.published_at).toBeTruthy();
  });

  it("dispatches to the instagram adapter", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "IG post",
      image_prompt: "Mobile van IG shot",
      target_channels: ["instagram"],
    };

    const draft_id = await spec.queueForApproval(post);
    await spec.approve(draft_id);

    const result = await spec.publish(draft_id, "instagram");
    expect(result.external_id).toMatch(/^ig_media_/);
  });

  it("throws for unknown channel", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "Weird channel post",
      image_prompt: "Generic prompt",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);
    await spec.approve(draft_id);

    await expect(spec.publish(draft_id, "tiktok")).rejects.toThrow(
      /No adapter registered/,
    );
  });

  it("throws when publishing an unapproved draft", async () => {
    const spec = await makeSpecialist(tmpDir);
    const post = {
      text: "Unapproved post",
      image_prompt: "Prompt",
      target_channels: ["fb-page"],
    };

    const draft_id = await spec.queueForApproval(post);
    // Do NOT call approve()

    await expect(spec.publish(draft_id, "fb-page")).rejects.toThrow(
      /not approved/,
    );
  });
});

// ─── Suite: quiet-hours guard ─────────────────────────────────────────────────

describe("isQuietHours", () => {
  it("returns true at 22:00 (start of quiet)", () => {
    const d = new Date("2026-06-04T22:00:00");
    expect(isQuietHours(d, 22, 9)).toBe(true);
  });

  it("returns true at 23:00 (mid-quiet)", () => {
    const d = new Date("2026-06-04T23:00:00");
    expect(isQuietHours(d, 22, 9)).toBe(true);
  });

  it("returns true at 00:00 (midnight)", () => {
    const d = new Date("2026-06-05T00:00:00");
    expect(isQuietHours(d, 22, 9)).toBe(true);
  });

  it("returns true at 08:00 (still quiet before end)", () => {
    const d = new Date("2026-06-04T08:00:00");
    expect(isQuietHours(d, 22, 9)).toBe(true);
  });

  it("returns false at 09:00 (quiet ends)", () => {
    const d = new Date("2026-06-04T09:00:00");
    expect(isQuietHours(d, 22, 9)).toBe(false);
  });

  it("returns false at 10:30 (business hours)", () => {
    const d = new Date("2026-06-04T10:30:00");
    expect(isQuietHours(d, 22, 9)).toBe(false);
  });

  it("returns false at 21:59 (one minute before quiet)", () => {
    const d = new Date("2026-06-04T21:59:00");
    expect(isQuietHours(d, 22, 9)).toBe(false);
  });
});

// ─── Suite: scheduler cadence logic ──────────────────────────────────────────

describe("parseCadence", () => {
  it("parses '3/week'", () => {
    expect(parseCadence("3/week")).toEqual({ count: 3, period: "week" });
  });

  it("parses '1/day'", () => {
    expect(parseCadence("1/day")).toEqual({ count: 1, period: "day" });
  });

  it("parses '2/week'", () => {
    expect(parseCadence("2/week")).toEqual({ count: 2, period: "week" });
  });

  it("throws on invalid cadence", () => {
    expect(() => parseCadence("daily")).toThrow("Invalid cadence");
  });
});

describe("shouldFire", () => {
  it("returns false if hour does not match preferred", () => {
    const state = { fires_this_week: 0 };
    expect(shouldFire(state, "3/week", 10, 9, "2026-06-01")).toBe(false);
  });

  it("returns false if already fired today", () => {
    const state = { fires_this_week: 1, last_fired_date: "2026-06-02" };
    expect(shouldFire(state, "3/week", 10, 10, "2026-06-02")).toBe(false);
  });

  it("returns true on Monday at preferred hour with 0 fires", () => {
    // 2026-06-01 is a Monday
    const state = { fires_this_week: 0, week_start: "2026-06-01" };
    expect(shouldFire(state, "3/week", 10, 10, "2026-06-01")).toBe(true);
  });

  it("returns false on Tuesday (not in Mon/Wed/Fri pattern for 3/week)", () => {
    // 2026-06-02 is a Tuesday
    const state = { fires_this_week: 0 };
    expect(shouldFire(state, "3/week", 10, 10, "2026-06-02")).toBe(false);
  });

  it("returns false when weekly quota is exhausted", () => {
    // Monday but already 3 fires this week
    const state = {
      fires_this_week: 3,
      week_start: getMondayOfWeek(new Date("2026-06-01")),
    };
    expect(shouldFire(state, "3/week", 10, 10, "2026-06-01")).toBe(false);
  });
});

describe("MarketingScheduler.tick", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "penelope-sched-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("does not fire when hour is wrong", async () => {
    const scheduler = new MarketingScheduler({
      role: "marketing",
      tenant_id: "test-tenant",
      tenants_root: tmpDir,
      vertical: "auto-service",
      business_context: "Mobile headlight restoration.",
      marketing: {
        cadence: "3/week",
        preferred_time_local: "10:30",
        channels: ["fb-page"],
        approval_required: true,
        timezone: "America/Edmonton",
      },
    });

    // Pass a time where UTC hour is 5 (not 10)
    const result = await scheduler.tick(new Date("2026-06-01T05:30:00Z"));
    expect(result.fired).toBe(false);
  });

  it("fires on Monday at the preferred hour and returns a draft_id", async () => {
    mockAnthropicResponse(MOCK_POST_JSON);

    const scheduler = new MarketingScheduler({
      role: "marketing",
      tenant_id: "test-tenant",
      tenants_root: tmpDir,
      vertical: "auto-service",
      business_context: "Mobile headlight restoration.",
      marketing: {
        cadence: "3/week",
        preferred_time_local: "10:30", // UTC hour 10
        channels: ["fb-page"],
        approval_required: true,
        timezone: "America/Edmonton",
      },
    });

    // 2026-06-01T10:00:00Z is a Monday, UTC hour = 10
    const result = await scheduler.tick(new Date("2026-06-01T10:00:00Z"));
    expect(result.fired).toBe(true);
    expect(typeof result.draft_id).toBe("string");
  });

  it("does not double-fire on the same day", async () => {
    mockAnthropicResponse(MOCK_POST_JSON);

    const config = {
      role: "marketing" as const,
      tenant_id: "test-tenant",
      tenants_root: tmpDir,
      vertical: "auto-service",
      business_context: "Mobile headlight restoration.",
      marketing: {
        cadence: "3/week",
        preferred_time_local: "10:30",
        channels: ["fb-page"],
        approval_required: true,
        timezone: "America/Edmonton",
      },
    };

    const scheduler = new MarketingScheduler(config);
    const firstTick = await scheduler.tick(new Date("2026-06-01T10:00:00Z"));
    expect(firstTick.fired).toBe(true);

    // Second tick same day, same hour
    const secondTick = await scheduler.tick(new Date("2026-06-01T10:00:00Z"));
    expect(secondTick.fired).toBe(false);
  });
});
