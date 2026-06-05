/**
 * ContentSpecialist + ContentScheduler unit tests.
 *
 * All image API calls (FAL.ai, Nano Banana) and Anthropic vision calls are mocked.
 * File I/O exercises a real tmp dir so sortDailyPhotos is tested end-to-end.
 * No real API keys are needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import {
  ContentSpecialist,
  MockFalAiAdapter,
  MockNanaBananaAdapter,
  isImageFile,
  dateSlug,
  isContentQuietHours,
  contentTodayUTC,
  type ContentSpecialistConfig,
  type IFalAiAdapter,
  type INanaBananaAdapter,
} from "../specialists/content.js";
import { ContentScheduler } from "../specialists/content-scheduler.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpRoot: string;

function makeTmpRoot(): string {
  const dir = join(tmpdir(), `penelope-content-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeConfig(
  overrides: Partial<ContentSpecialistConfig> = {},
): ContentSpecialistConfig {
  return {
    role: "content",
    tenant_id: "test-tenant",
    tenants_root: tmpRoot,
    content: {
      enabled: true,
      providers: { image_gen: "fal-ai", static_promo: "nano-banana", vision: "mock" },
      daily_sort_at_utc: "03:00",
      watermark_targets: ["test watermark"],
      object_removal_defaults: ["tape", "tools"],
      output_folder: "sorted",
    },
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  tmpRoot = makeTmpRoot();
  // Also create the tenant state dir
  mkdirSync(join(tmpRoot, "test-tenant", "state"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Utility functions ────────────────────────────────────────────────────────

describe("isImageFile", () => {
  it("returns true for jpg", () => expect(isImageFile("photo.jpg")).toBe(true));
  it("returns true for JPEG (uppercase ext)", () => expect(isImageFile("photo.JPEG")).toBe(true));
  it("returns true for png", () => expect(isImageFile("shot.png")).toBe(true));
  it("returns true for webp", () => expect(isImageFile("img.webp")).toBe(true));
  it("returns false for txt", () => expect(isImageFile("note.txt")).toBe(false));
  it("returns false for mp4", () => expect(isImageFile("video.mp4")).toBe(false));
});

describe("dateSlug", () => {
  it("returns YYYY-MM-DD from a fixed date", () => {
    const d = new Date("2026-06-05T14:30:00Z");
    expect(dateSlug(d)).toBe("2026-06-05");
  });
});

describe("contentTodayUTC", () => {
  it("returns same format as dateSlug", () => {
    const d = new Date("2026-06-05T00:00:00Z");
    expect(contentTodayUTC(d)).toBe("2026-06-05");
  });
});

describe("isContentQuietHours", () => {
  it("returns false during normal working hours (UTC 12:00)", () => {
    expect(isContentQuietHours(new Date("2026-06-05T12:00:00Z"))).toBe(false);
  });
  it("returns true during late-night UTC (00:00)", () => {
    expect(isContentQuietHours(new Date("2026-06-05T00:00:00Z"))).toBe(true);
  });
});

// ─── Mock adapters ─────────────────────────────────────────────────────────────

describe("MockFalAiAdapter", () => {
  it("inpaint returns mock:// URL with source encoded", async () => {
    const adapter = new MockFalAiAdapter();
    const result = await adapter.inpaint("file:///test/photo.jpg", { prompt: "clean car" });
    expect(result.url).toMatch(/^mock:\/\/fal-ai\/inpaint/);
    expect(result.url).toContain("clean+car");
  });

  it("imageToImage returns mock:// URL", async () => {
    const adapter = new MockFalAiAdapter();
    const result = await adapter.imageToImage({ image_url: "file:///test.jpg", prompt: "before after" });
    expect(result.url).toMatch(/^mock:\/\/fal-ai\/image-to-image/);
  });

  it("textToImage returns dimensions", async () => {
    const adapter = new MockFalAiAdapter();
    const result = await adapter.textToImage({ prompt: "promo", width: 800, height: 600 });
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("videoFromImages includes frame count", async () => {
    const adapter = new MockFalAiAdapter();
    const result = await adapter.videoFromImages({ image_urls: ["a.jpg", "b.jpg", "c.jpg"], fps: 12 });
    expect(result.url).toContain("frames=3");
    expect(result.url).toContain("fps=12");
  });
});

describe("MockNanaBananaAdapter", () => {
  it("generate returns array with requested count", async () => {
    const adapter = new MockNanaBananaAdapter();
    const results = await adapter.generate({ prompt: "clean promo", num_outputs: 3 });
    expect(results).toHaveLength(3);
    expect(results[0]!.url).toMatch(/^mock:\/\/nano-banana\/generate/);
  });

  it("defaults to 1 output", async () => {
    const adapter = new MockNanaBananaAdapter();
    const results = await adapter.generate({ prompt: "studio shot" });
    expect(results).toHaveLength(1);
  });
});

// ─── ContentSpecialist ─────────────────────────────────────────────────────────

describe("ContentSpecialist.classifyImage", () => {
  it("classifies 'before' from hint filename", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "job_before.jpg");
    expect(result.category).toBe("before");
    expect(result.suggested_folder).toBe("sorted/before");
  });

  it("classifies 'after' from hint", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "after_restoration.jpg");
    expect(result.category).toBe("after");
  });

  it("classifies 'tool' from hint", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "sanding_tool.jpg");
    expect(result.category).toBe("tool");
  });

  it("classifies 'in-progress' from hint", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "in-progress_step2.jpg");
    expect(result.category).toBe("in-progress");
  });

  it("falls through to 'other' for unknown hint", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "IMG_20260605_123456.jpg");
    expect(result.category).toBe("other");
  });

  it("extracts customer_id from hint", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "cust_abc123_before.jpg");
    expect(result.customer_id).toBe("abc123");
  });

  it("confidence is lower when no buffer provided", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.classifyImage(null, "before.jpg");
    expect(result.confidence).toBeLessThan(1);
  });
});

describe("ContentSpecialist.removeObjects", () => {
  it("calls FAL inpaint with object list in prompt", async () => {
    const mockFal: IFalAiAdapter = {
      inpaint: vi.fn().mockResolvedValue({ url: "mock://cleaned.jpg" }),
      imageToImage: vi.fn(),
      textToImage: vi.fn(),
      videoFromImages: vi.fn(),
    };
    const specialist = new ContentSpecialist(makeConfig({ adapterOverrides: { falAi: mockFal } }));
    const result = await specialist.removeObjects("/tmp/photo.jpg", ["tape", "tools"]);

    expect(mockFal.inpaint).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/photo.jpg"),
      expect.objectContaining({ prompt: expect.stringContaining("tape") }),
    );
    expect(result.url).toBe("mock://cleaned.jpg");
    expect(result.generated_at).toBeTruthy();
  });

  it("returns original URL when objects list is empty", async () => {
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.removeObjects("/tmp/photo.jpg", []);
    expect(result.url).toContain("photo.jpg");
  });
});

describe("ContentSpecialist.removeWatermarks", () => {
  it("calls FAL inpaint with watermark targets from config", async () => {
    const mockFal: IFalAiAdapter = {
      inpaint: vi.fn().mockResolvedValue({ url: "mock://no-watermark.jpg" }),
      imageToImage: vi.fn(),
      textToImage: vi.fn(),
      videoFromImages: vi.fn(),
    };
    const specialist = new ContentSpecialist(makeConfig({ adapterOverrides: { falAi: mockFal } }));
    const result = await specialist.removeWatermarks("/tmp/watermarked.jpg");

    expect(mockFal.inpaint).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ prompt: expect.stringContaining("test watermark") }),
    );
    expect(result.url).toBe("mock://no-watermark.jpg");
  });
});

describe("ContentSpecialist.generateBeforeAfter", () => {
  it("returns split_image_url, before_clean_url, after_clean_url", async () => {
    const callCount = { inpaint: 0, imageToImage: 0 };
    const mockFal: IFalAiAdapter = {
      inpaint: vi.fn().mockImplementation(async (src: string) => {
        callCount.inpaint++;
        return { url: `mock://cleaned/${callCount.inpaint}` };
      }),
      imageToImage: vi.fn().mockResolvedValue({ url: "mock://split-composite.jpg" }),
      textToImage: vi.fn(),
      videoFromImages: vi.fn(),
    };
    const specialist = new ContentSpecialist(makeConfig({ adapterOverrides: { falAi: mockFal } }));
    const result = await specialist.generateBeforeAfter("/tmp/before.jpg", "/tmp/after.jpg");

    expect(result.split_image_url).toBe("mock://split-composite.jpg");
    expect(result.before_clean_url).toBeTruthy();
    expect(result.after_clean_url).toBeTruthy();
    expect(result.generated_at).toBeTruthy();
    // Both images should be cleaned (2 inpaint calls)
    expect(mockFal.inpaint).toHaveBeenCalledTimes(2);
  });
});

describe("ContentSpecialist.generateStaticPromo", () => {
  it("calls NanaBanana and returns result", async () => {
    const mockNB: INanaBananaAdapter = {
      generate: vi.fn().mockResolvedValue([{ url: "mock://promo.jpg", width: 1200, height: 1200 }]),
    };
    const specialist = new ContentSpecialist(makeConfig({ adapterOverrides: { nanoBanana: mockNB } }));
    const result = await specialist.generateStaticPromo("/tmp/product.jpg", "clean headlight on white background");

    expect(mockNB.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "clean headlight on white background", num_outputs: 1 }),
    );
    expect(result.url).toBe("mock://promo.jpg");
    expect(result.width).toBe(1200);
  });
});

describe("ContentSpecialist.sortDailyPhotos", () => {
  it("moves image files to sorted/<date>/<category>/", async () => {
    // Create a fake inbox folder with some images
    const inbox = join(tmpRoot, "inbox");
    mkdirSync(inbox);
    writeFileSync(join(inbox, "before_job.jpg"), "fake jpg data");
    writeFileSync(join(inbox, "after_job.jpg"), "fake jpg data");
    writeFileSync(join(inbox, "notes.txt"), "not an image");

    const now = new Date("2026-06-05T10:00:00Z");
    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.sortDailyPhotos(inbox, { now });

    expect(result.total_scanned).toBe(2);
    expect(result.moved).toHaveLength(2);
    expect(result.failed).toHaveLength(0);

    // Verify both ended up in sorted/2026-06-05/<category>/
    const beforeMoved = result.moved.find(m => m.includes("before_job"));
    const afterMoved = result.moved.find(m => m.includes("after_job"));
    expect(beforeMoved).toContain("sorted/2026-06-05/before");
    expect(afterMoved).toContain("sorted/2026-06-05/after");
  });

  it("skips non-image files", async () => {
    const inbox = join(tmpRoot, "inbox2");
    mkdirSync(inbox);
    writeFileSync(join(inbox, "readme.txt"), "text");
    writeFileSync(join(inbox, "data.json"), "{}");

    const specialist = new ContentSpecialist(makeConfig());
    const result = await specialist.sortDailyPhotos(inbox);
    expect(result.total_scanned).toBe(0);
    expect(result.moved).toHaveLength(0);
  });
});

// ─── ContentScheduler ──────────────────────────────────────────────────────────

describe("ContentScheduler", () => {
  it("runs once per UTC day", async () => {
    const inbox = join(tmpRoot, "sched-inbox");
    mkdirSync(inbox);

    const config = makeConfig();
    const scheduler = new ContentScheduler(config, inbox);
    const now = new Date("2026-06-05T03:00:00Z");

    const r1 = await scheduler.tick(now);
    expect(r1.ran).toBe(true);

    // Second call same day should skip
    const r2 = await scheduler.tick(now);
    expect(r2.ran).toBe(false);
    expect(r2.skipped_reason).toContain("already ran today");
  });

  it("force flag bypasses once-per-day guard", async () => {
    const inbox = join(tmpRoot, "sched-inbox2");
    mkdirSync(inbox);

    const config = makeConfig();
    const scheduler = new ContentScheduler(config, inbox);
    const now = new Date("2026-06-05T03:00:00Z");

    await scheduler.tick(now);
    const r2 = await scheduler.tick(now, true);
    expect(r2.ran).toBe(true);
  });

  it("returns ran=false when content disabled", async () => {
    const inbox = join(tmpRoot, "sched-inbox3");
    mkdirSync(inbox);

    const config = makeConfig({ content: { ...makeConfig().content, enabled: false } });
    const scheduler = new ContentScheduler(config, inbox);
    const result = await scheduler.tick();
    expect(result.ran).toBe(false);
    expect(result.skipped_reason).toContain("disabled");
  });

  it("tick includes sort_result on successful run", async () => {
    const inbox = join(tmpRoot, "sched-inbox4");
    mkdirSync(inbox);
    writeFileSync(join(inbox, "before.jpg"), "data");

    const config = makeConfig();
    const scheduler = new ContentScheduler(config, inbox);
    const now = new Date("2026-06-05T03:00:00Z");
    const result = await scheduler.tick(now);

    expect(result.ran).toBe(true);
    expect(result.sort_result).toBeDefined();
    expect(result.sort_result!.total_scanned).toBe(1);
  });
});
