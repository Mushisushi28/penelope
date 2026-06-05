/**
 * ContentSpecialist — image classification, before/after generation, cleanup,
 * static promo creation, and daily photo sorting.
 *
 * Org-chart position:
 *   USER ←─── telegram-owner ───→ PENELOPE
 *                                      │
 *                              ContentSpecialist (bus only)
 *
 * This specialist NEVER touches telegram-owner. All results are published to
 * the loom-a2a internal bus and relayed to the owner by Penelope.
 *
 * Hard constraints:
 *   - All image API calls (FAL.ai, Nano Banana) are mocked unless real keys present.
 *   - Vision classification uses Claude vision or a configurable adapter.
 *   - sortDailyPhotos is idempotent: already-sorted files are skipped.
 *   - No outbound post/send — only generates assets and queues for Penelope.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
// Note: readFile/writeFile not needed in ContentSpecialist — state is managed by ContentScheduler
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SpecialistAgent, type SpecialistConfig } from "./base.js";

// ─── Adapter interfaces (mirrored from @penelope/connectors for standalone use) ─

/**
 * Minimal FAL.ai adapter interface.
 * The real FalAiAdapter from @penelope/connectors satisfies this interface.
 * Tests inject a mock that also satisfies it.
 */
export interface IFalAiAdapter {
  inpaint(sourceImageUrl: string, opts?: { prompt?: string; negative_prompt?: string; strength?: number; mask_url?: string }): Promise<{ url: string }>;
  imageToImage(opts: { image_url: string; prompt: string; strength?: number; negative_prompt?: string }): Promise<{ url: string }>;
  textToImage(opts: { prompt: string; negative_prompt?: string; width?: number; height?: number }): Promise<{ url: string; width?: number; height?: number }>;
  videoFromImages(opts: { image_urls: string[]; prompt?: string; fps?: number; duration?: number }): Promise<{ url: string }>;
}

/**
 * Minimal Nano Banana adapter interface.
 * The real NanaBananaAdapter from @penelope/connectors satisfies this interface.
 * Tests inject a mock that also satisfies it.
 */
export interface INanaBananaAdapter {
  generate(opts: { product_image_url?: string; prompt: string; negative_prompt?: string; width?: number; height?: number; style?: string; num_outputs?: number }): Promise<Array<{ url: string; width: number; height: number }>>;
}

// ─── Default mock adapters (no API keys required) ──────────────────────────────

/** Stub FAL.ai adapter — returns mock:// URLs. Used when no FAL_KEY is present. */
function qenc(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, '+');
}

export class MockFalAiAdapter implements IFalAiAdapter {
  async inpaint(sourceImageUrl: string, opts: { prompt?: string } = {}): Promise<{ url: string }> {
    return { url: `mock://fal-ai/inpaint?src=${qenc(sourceImageUrl)}&prompt=${qenc(opts.prompt ?? '')}` };
  }
  async imageToImage(opts: { image_url: string; prompt: string }): Promise<{ url: string }> {
    return { url: `mock://fal-ai/image-to-image?src=${qenc(opts.image_url)}&prompt=${qenc(opts.prompt)}` };
  }
  async textToImage(opts: { prompt: string; width?: number; height?: number }): Promise<{ url: string; width: number; height: number }> {
    return { url: `mock://fal-ai/text-to-image?prompt=${encodeURIComponent(opts.prompt)}`, width: opts.width ?? 1024, height: opts.height ?? 1024 };
  }
  async videoFromImages(opts: { image_urls: string[]; fps?: number }): Promise<{ url: string }> {
    return { url: `mock://fal-ai/video?frames=${opts.image_urls.length}&fps=${opts.fps ?? 8}` };
  }
}

/** Stub Nano Banana adapter — returns mock:// URLs. Used when no NANO_BANANA_API_KEY is present. */
export class MockNanaBananaAdapter implements INanaBananaAdapter {
  async generate(opts: { prompt: string; width?: number; height?: number; num_outputs?: number }): Promise<Array<{ url: string; width: number; height: number }>> {
    const n = opts.num_outputs ?? 1;
    return Array.from({ length: n }, (_, i) => ({
      url: `mock://nano-banana/generate?prompt=${encodeURIComponent(opts.prompt)}&idx=${i}`,
      width: opts.width ?? 1200,
      height: opts.height ?? 1200,
    }));
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ImageCategory = 'before' | 'after' | 'in-progress' | 'tool' | 'other';

export interface ClassifyImageResult {
  category: ImageCategory;
  confidence: number;
  suggested_folder: string;
  customer_id?: string;
}

export interface BeforeAfterResult {
  split_image_url: string;
  before_clean_url: string;
  after_clean_url: string;
  generated_at: string;
}

export interface CleanupResult {
  url: string;
  generated_at: string;
}

export interface StaticPromoResult {
  url: string;
  width: number;
  height: number;
  generated_at: string;
}

export interface SortResult {
  total_scanned: number;
  moved: string[];
  skipped_already_sorted: string[];
  failed: string[];
  sorted_root: string;
}

export interface ContentConfig {
  enabled: boolean;
  providers: {
    image_gen: string;
    static_promo: string;
    vision: string;
  };
  daily_sort_at_utc: string;
  watermark_targets: string[];
  object_removal_defaults: string[];
  output_folder: string;
}

export interface ContentSpecialistConfig extends SpecialistConfig {
  /** Absolute path to the tenants root (e.g. /repo/tenants). */
  tenants_root: string;
  /** Content config block from tenant.json. */
  content: ContentConfig;
  /** Anthropic model to use for vision classification. */
  model?: string;
  /**
   * Injected adapter overrides (for tests or when @penelope/connectors is available).
   * Defaults to MockFalAiAdapter / MockNanaBananaAdapter when not provided.
   */
  adapterOverrides?: {
    falAi?: IFalAiAdapter;
    nanoBanana?: INanaBananaAdapter;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif']);

/** Supported image extensions for sorting scans. */
export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filename).toLowerCase());
}

/** Extract a YYYY-MM-DD date string from an ISO timestamp. */
export function dateSlug(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Return true if we're in content quiet hours (default: 03:00 UTC daily sort window). */
export function isContentQuietHours(
  now: Date = new Date(),
  quietStart = 23,
  quietEnd = 5,
): boolean {
  const hour = now.getUTCHours();
  if (quietStart > quietEnd) {
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

/** Return today's UTC date as YYYY-MM-DD. */
export function contentTodayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ─── ContentSpecialist ────────────────────────────────────────────────────────

export class ContentSpecialist extends SpecialistAgent {
  private readonly config: ContentSpecialistConfig;
  private readonly anthropic: Anthropic;
  private readonly fal: IFalAiAdapter;
  private readonly nanoBanana: INanaBananaAdapter;

  constructor(config: ContentSpecialistConfig) {
    super({ role: 'content', tenant_id: config.tenant_id });
    this.config = config;
    this.anthropic = new Anthropic();
    // Default to mocks; real adapters from @penelope/connectors injected via adapterOverrides
    // TODO: when FAL_KEY is wired, inject: new FalAiAdapter() from @penelope/connectors
    // TODO: when NANO_BANANA_API_KEY is wired, inject: new NanaBananaAdapter() from @penelope/connectors
    this.fal = config.adapterOverrides?.falAi ?? new MockFalAiAdapter();
    this.nanoBanana = config.adapterOverrides?.nanoBanana ?? new MockNanaBananaAdapter();
  }

  // ── Image classification ──────────────────────────────────────────────────────

  /**
   * Classify an image buffer (or URL) into a category.
   *
   * Uses Claude vision when config.content.providers.vision === 'claude'.
   * In mock mode (no ANTHROPIC_API_KEY), falls back to deterministic keyword
   * heuristics on the hint string.
   *
   * @param buffer  Raw image bytes, or pass null to use hint-only mode.
   * @param hint    Optional filename or customer context string (used for heuristics).
   */
  async classifyImage(
    buffer: Buffer | null,
    hint?: string,
  ): Promise<ClassifyImageResult> {
    const hintLower = (hint ?? '').toLowerCase();

    // Vision classification path
    if (buffer && this.config.content.providers.vision === 'claude') {
      try {
        const base64 = buffer.toString('base64');
        const response = await this.anthropic.messages.create({
          model: this.config.model ?? 'claude-haiku-4-5',
          max_tokens: 64,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
                },
                {
                  type: 'text',
                  text: 'Classify this automotive service photo. Respond with exactly one word: before, after, in-progress, tool, or other.',
                },
              ],
            },
          ],
        });
        const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim().toLowerCase() : 'other';
        const category = (['before', 'after', 'in-progress', 'tool', 'other'].includes(raw) ? raw : 'other') as ImageCategory;
        return {
          category,
          confidence: 0.85,
          suggested_folder: this._suggestedFolder(category),
        };
      } catch {
        // Fall through to heuristic
      }
    }

    // Heuristic fallback (hint-based, always available in tests)
    const category = this._heuristicCategory(hintLower);
    return {
      category,
      confidence: buffer ? 0.6 : 0.4,
      suggested_folder: this._suggestedFolder(category),
      customer_id: this._extractCustomerId(hintLower),
    };
  }

  private _heuristicCategory(hint: string): ImageCategory {
    // Substring matching (lowercased hint) — word-boundary not used to handle
    // filenames like "before_job.jpg", "sanding_tool.jpg", "in-progress_step2.jpg"
    if (hint.includes('in-progress') || hint.includes('inprogress') || hint.includes('during')) return 'in-progress';
    if (hint.includes('before')) return 'before';
    if (hint.includes('after')) return 'after';
    if (hint.includes('tool') || hint.includes('sand') || hint.includes('polish') || hint.includes('equip')) return 'tool';
    return 'other';
  }

  private _suggestedFolder(category: ImageCategory): string {
    return `sorted/${category}`;
  }

  private _extractCustomerId(hint: string): string | undefined {
    // Match "cust_abc123" or "customer_abc123" — stop at next underscore
    const m = hint.match(/(?:cust|customer|id)[_-]?([a-zA-Z0-9]+)(?:[_-]|$)/i);
    return m?.[1];
  }

  // ── Before/after generation ───────────────────────────────────────────────────

  /**
   * Generate a clean before/after composite from two job photos.
   *
   * Step 1: clean each image (remove tape/tools/watermarks).
   * Step 2: generate a side-by-side split image via FAL.ai image-to-image.
   *
   * @param beforePath  Absolute path to the "before" job photo.
   * @param afterPath   Absolute path to the "after" job photo.
   * @param opts        Optional overrides.
   */
  async generateBeforeAfter(
    beforePath: string,
    afterPath: string,
    opts: { removal_targets?: string[] } = {},
  ): Promise<BeforeAfterResult> {
    const removalTargets = opts.removal_targets ?? this.config.content.object_removal_defaults;

    // Step 1: clean each image
    const [beforeClean, afterClean] = await Promise.all([
      this.removeObjects(beforePath, removalTargets),
      this.removeObjects(afterPath, removalTargets),
    ]);

    // Step 2: create split composite via FAL.ai image-to-image
    const splitResult = await this.fal.imageToImage({
      image_url: beforeClean.url,
      prompt: `Create a professional side-by-side before/after split image. Left side: headlights before restoration (foggy/yellowed). Right side: headlights after restoration (clear/bright). Same angle, clean background, automotive photography style. After image reference: ${afterClean.url}`,
      strength: 0.6,
      negative_prompt: 'text, watermark, tape, tools, hands, dirt, blur',
    });

    return {
      split_image_url: splitResult.url,
      before_clean_url: beforeClean.url,
      after_clean_url: afterClean.url,
      generated_at: new Date().toISOString(),
    };
  }

  // ── Watermark removal ──────────────────────────────────────────────────────────

  /**
   * Remove watermarks from an image using FAL.ai inpaint.
   *
   * @param imagePath  Absolute path to the source image.
   * @param opts       Optional overrides for targets and strength.
   */
  async removeWatermarks(
    imagePath: string,
    opts: { targets?: string[]; strength?: number } = {},
  ): Promise<CleanupResult> {
    const targets = opts.targets ?? this.config.content.watermark_targets;
    const prompt = `Remove all watermarks and text overlays: ${targets.join(', ')}. Clean, professional automotive photography.`;

    const result = await this.fal.inpaint(this._pathToUrl(imagePath), {
      prompt,
      negative_prompt: 'watermark, text, logo, copyright, overlay',
      strength: opts.strength ?? 0.9,
    });

    return { url: result.url, generated_at: new Date().toISOString() };
  }

  // ── Object removal ────────────────────────────────────────────────────────────

  /**
   * Remove specific objects from an image using FAL.ai inpaint.
   *
   * @param imagePath  Absolute path to the source image.
   * @param objects    List of object names to remove (e.g. ['tape', 'tools', 'masking']).
   * @param opts       Optional overrides.
   */
  async removeObjects(
    imagePath: string,
    objects: string[],
    opts: { strength?: number } = {},
  ): Promise<CleanupResult> {
    if (objects.length === 0) {
      return {
        url: this._pathToUrl(imagePath),
        generated_at: new Date().toISOString(),
      };
    }

    const prompt = `Remove the following objects and replace with clean background: ${objects.join(', ')}. Professional automotive photography, natural-looking result.`;

    const result = await this.fal.inpaint(this._pathToUrl(imagePath), {
      prompt,
      negative_prompt: objects.join(', '),
      strength: opts.strength ?? 0.85,
    });

    return { url: result.url, generated_at: new Date().toISOString() };
  }

  // ── Static promo generation ───────────────────────────────────────────────────

  /**
   * Generate a clean static promotional image via Nano Banana.
   *
   * Used for social media posts, ad creatives, listing images.
   *
   * @param productImagePath  Absolute path to the product/job photo.
   * @param prompt            Text description of the desired composition.
   * @param opts              Optional style and size overrides.
   */
  async generateStaticPromo(
    productImagePath: string,
    prompt: string,
    opts: { style?: string; width?: number; height?: number } = {},
  ): Promise<StaticPromoResult> {
    const results = await this.nanoBanana.generate({
      product_image_url: this._pathToUrl(productImagePath),
      prompt,
      style: opts.style ?? 'studio',
      width: opts.width ?? 1200,
      height: opts.height ?? 1200,
      num_outputs: 1,
    });

    const result = results[0];
    if (!result) throw new Error('[ContentSpecialist] Nano Banana returned no results');

    return {
      url: result.url,
      width: result.width,
      height: result.height,
      generated_at: new Date().toISOString(),
    };
  }

  // ── Daily photo sorting ───────────────────────────────────────────────────────

  /**
   * Scan a folder, classify each image, and move it to sorted/<date>/<category>/.
   *
   * Idempotent: files already under sorted/ are skipped.
   * Safe: skips non-image files.
   *
   * @param folderPath  Absolute path to the folder to scan.
   * @param opts        Optional overrides.
   */
  async sortDailyPhotos(
    folderPath: string,
    opts: { now?: Date; output_folder?: string } = {},
  ): Promise<SortResult> {
    const now = opts.now ?? new Date();
    const outputFolder = opts.output_folder ?? this.config.content.output_folder ?? 'sorted';
    const sortedRoot = join(folderPath, outputFolder);
    const dateStr = dateSlug(now);

    const entries = await readdir(folderPath);
    const result: SortResult = {
      total_scanned: 0,
      moved: [],
      skipped_already_sorted: [],
      failed: [],
      sorted_root: sortedRoot,
    };

    for (const entry of entries) {
      const fullPath = join(folderPath, entry);

      // Skip directories (including our own sorted/ output)
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat || fileStat.isDirectory()) continue;

      // Skip non-image files
      if (!isImageFile(entry)) continue;

      result.total_scanned++;

      // Skip already-sorted files (anything under sorted/)
      if (entry.startsWith(`${outputFolder}/`) || fullPath.startsWith(sortedRoot)) {
        result.skipped_already_sorted.push(entry);
        continue;
      }

      try {
        const classification = await this.classifyImage(null, entry);
        const destDir = join(sortedRoot, dateStr, classification.category);
        await mkdir(destDir, { recursive: true });

        // Avoid filename collisions
        const destBase = basename(entry);
        let destPath = join(destDir, destBase);
        if (existsSync(destPath)) {
          const ext = extname(destBase);
          const stem = destBase.slice(0, destBase.length - ext.length);
          destPath = join(destDir, `${stem}_${randomUUID().slice(0, 8)}${ext}`);
        }

        await rename(fullPath, destPath);
        result.moved.push(`${entry} → sorted/${dateStr}/${classification.category}/${basename(destPath)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.failed.push(`${entry}: ${msg}`);
      }
    }

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /**
   * Convert a local file path to a URL string suitable for adapter calls.
   * In tests and mock mode, this returns a file:// URL.
   * Real adapters will need actual HTTP(S) URLs — callers must pre-upload if needed.
   */
  private _pathToUrl(filePath: string): string {
    // If it already looks like a URL, pass through
    if (/^https?:\/\//.test(filePath) || /^mock:\/\//.test(filePath)) return filePath;
    return `file://${filePath.replace(/\\/g, '/')}`;
  }

  // ── SpecialistAgent.run (bus entry point) ─────────────────────────────────────

  async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const action = payload['action'] as string | undefined;

    switch (action) {
      case 'classify_image': {
        const bufferBase64 = payload['image_base64'] as string | undefined;
        const hint = payload['hint'] as string | undefined;
        const buffer = bufferBase64 ? Buffer.from(bufferBase64, 'base64') : null;
        const result = await this.classifyImage(buffer, hint);
        return result as unknown as Record<string, unknown>;
      }

      case 'generate_before_after': {
        const beforePath = payload['before_path'] as string;
        const afterPath = payload['after_path'] as string;
        const removalTargets = payload['removal_targets'] as string[] | undefined;
        const result = await this.generateBeforeAfter(beforePath, afterPath, { removal_targets: removalTargets });
        return result as unknown as Record<string, unknown>;
      }

      case 'remove_watermarks': {
        const imagePath = payload['image_path'] as string;
        const targets = payload['targets'] as string[] | undefined;
        const strength = payload['strength'] as number | undefined;
        const result = await this.removeWatermarks(imagePath, { targets, strength });
        return result as unknown as Record<string, unknown>;
      }

      case 'remove_objects': {
        const imagePath = payload['image_path'] as string;
        const objects = (payload['objects'] as string[]) ?? this.config.content.object_removal_defaults;
        const result = await this.removeObjects(imagePath, objects);
        return result as unknown as Record<string, unknown>;
      }

      case 'generate_static_promo': {
        const productImagePath = payload['product_image_path'] as string;
        const prompt = payload['prompt'] as string;
        const style = payload['style'] as string | undefined;
        const result = await this.generateStaticPromo(productImagePath, prompt, { style });
        return result as unknown as Record<string, unknown>;
      }

      case 'sort_daily_photos': {
        const folderPath = payload['folder_path'] as string;
        const nowStr = payload['now'] as string | undefined;
        const now = nowStr ? new Date(nowStr) : undefined;
        const result = await this.sortDailyPhotos(folderPath, { now });
        return result as unknown as Record<string, unknown>;
      }

      default:
        throw new Error(
          `[ContentSpecialist] Unknown action "${action}". ` +
            'Expected: classify_image | generate_before_after | remove_watermarks | remove_objects | generate_static_promo | sort_daily_photos',
        );
    }
  }
}
