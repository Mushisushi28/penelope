/**
 * MarketingSpecialist — generates, queues, approves, and publishes social posts.
 *
 * Org-chart position:
 *   USER ←─── telegram-owner ───→ PENELOPE
 *                                      │
 *                              MarketingSpecialist (bus only)
 *
 * This specialist NEVER touches telegram-owner. All results are published to
 * the loom-a2a internal bus and relayed to the owner by Penelope.
 *
 * Image generation: fal.ai fast-sdxl (no extra binary install).
 * If FAL_KEY is absent, generateImage returns a stub URL and logs a warning.
 */

import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SpecialistAgent, type SpecialistConfig } from "./base.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostInput {
  vertical: string;
  vibe?: string;
  business_context: string;
}

export interface GeneratedPost {
  text: string;
  image_prompt: string;
  target_channels: string[];
}

export interface MarketingDraft {
  draft_id: string;
  tenant_id: string;
  status: "pending" | "approved" | "published" | "rejected";
  created_at: string;
  approved_at?: string;
  published_at?: string;
  post: GeneratedPost;
  publish_result?: Record<string, PublishResult>;
}

export interface PublishResult {
  external_id: string;
  channel: string;
  published_at: string;
}

export interface MarketingConfig {
  cadence: string;
  preferred_time_local: string;
  channels: string[];
  voice_notes?: string;
  approval_required: boolean;
}

export interface MarketingSpecialistConfig extends SpecialistConfig {
  /** Absolute path to the tenants root (e.g. /repo/tenants). Used for queue persistence. */
  tenants_root: string;
  /** Marketing config block from tenant.json */
  marketing: MarketingConfig;
  /** Anthropic model to use for copy generation */
  model?: string;
}

// ─── Channel adapter stubs ────────────────────────────────────────────────────
// Real implementations live in @penelope/adapters. These stubs dispatch to the
// bus and return a placeholder external_id so the specialist stays decoupled.

export interface ChannelAdapter {
  publish(text: string, image_url: string): Promise<string>;
}

export class FbPageAdapter implements ChannelAdapter {
  async publish(text: string, _image_url: string): Promise<string> {
    // Real: POST /me/feed via Graph API with access token from env.
    void text;
    return `fb_post_${Date.now()}`;
  }
}

export class InstagramAdapter implements ChannelAdapter {
  async publish(text: string, _image_url: string): Promise<string> {
    // Real: POST /me/media + /me/media_publish via Graph API.
    void text;
    return `ig_media_${Date.now()}`;
  }
}

export class TwitterAdapter implements ChannelAdapter {
  async publish(text: string, _image_url: string): Promise<string> {
    // Real: POST /2/tweets via Twitter API v2 (Hermes connector).
    void text;
    return `tweet_${Date.now()}`;
  }
}

const CHANNEL_ADAPTERS: Record<string, () => ChannelAdapter> = {
  "fb-page": () => new FbPageAdapter(),
  instagram: () => new InstagramAdapter(),
  twitter: () => new TwitterAdapter(),
};

// ─── Quiet-hours guard ────────────────────────────────────────────────────────

/**
 * Returns true if the current hour (in the given timezone) falls inside the
 * quiet window (22:00–09:00 by default).
 */
export function isQuietHours(
  now: Date = new Date(),
  quietStart = 22,
  quietEnd = 9,
): boolean {
  const hour = now.getHours(); // caller should pass a tz-adjusted date
  if (quietStart > quietEnd) {
    // wraps midnight: quiet if hour >= start OR hour < end
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

// ─── MarketingSpecialist ──────────────────────────────────────────────────────

export class MarketingSpecialist extends SpecialistAgent {
  private readonly config: MarketingSpecialistConfig;
  private readonly anthropic: Anthropic;

  constructor(config: MarketingSpecialistConfig) {
    super({ role: "marketing", tenant_id: config.tenant_id });
    this.config = config;
    this.anthropic = new Anthropic({
      // API key read from ANTHROPIC_API_KEY env by default.
    });
  }

  // ── Core: generate post ─────────────────────────────────────────────────

  async generatePost(input: PostInput): Promise<GeneratedPost> {
    const voiceNotes =
      this.config.marketing.voice_notes ?? "professional, friendly, concise";
    const channels = this.config.marketing.channels;

    const systemPrompt = `You are a social media copywriter for a small business.
Voice: ${voiceNotes}
Business vertical: ${input.vertical}
Vibe: ${input.vibe ?? "engaging and authentic"}

Generate exactly a JSON object with these keys:
- text: the social post body (no hashtag spam, max 280 chars for Twitter compat)
- image_prompt: a vivid DALL-E / Stable Diffusion image prompt that matches the post
- target_channels: array subset of ${JSON.stringify(channels)} that best fit this post

Respond with ONLY valid JSON. No markdown fences.`;

    const userMessage = `Business context: ${input.business_context}

Draft a single on-brand social post now.`;

    const message = await this.anthropic.messages.create({
      model: this.config.model ?? "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsed: GeneratedPost;
    try {
      parsed = JSON.parse(raw) as GeneratedPost;
    } catch {
      // Fallback if the model wrapped in markdown despite instructions
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(
          `[MarketingSpecialist] LLM returned non-JSON response: ${raw.slice(0, 200)}`,
        );
      }
      parsed = JSON.parse(match[0]) as GeneratedPost;
    }

    return {
      text: parsed.text,
      image_prompt: parsed.image_prompt,
      target_channels: parsed.target_channels ?? channels,
    };
  }

  // ── Core: generate image ────────────────────────────────────────────────

  /**
   * Generate an image using fal.ai fast-sdxl.
   * Falls back to a stub URL if FAL_KEY is not set (dev mode).
   */
  async generateImage(
    prompt: string,
  ): Promise<{ url?: string; base64?: string }> {
    const falKey = process.env["FAL_KEY"];
    if (!falKey) {
      console.warn(
        "[MarketingSpecialist] FAL_KEY not set — returning stub image URL. " +
          "Set FAL_KEY=<your-fal-key> for real image generation.",
      );
      return {
        url: `https://placehold.co/1080x1080?text=${encodeURIComponent(prompt.slice(0, 40))}`,
      };
    }

    // fal.ai REST API — no extra npm dependency required.
    const response = await fetch(
      "https://fal.run/fal-ai/fast-sdxl",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: "square_hd",
          num_images: 1,
          num_inference_steps: 25,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `[MarketingSpecialist] fal.ai request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      images?: Array<{ url: string }>;
    };
    const imageUrl = result.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error(
        "[MarketingSpecialist] fal.ai returned no images in response",
      );
    }

    return { url: imageUrl };
  }

  // ── Core: queue management ──────────────────────────────────────────────

  private queuePath(): string {
    return join(
      this.config.tenants_root,
      this.tenantId,
      "state",
      "marketing-queue.json",
    );
  }

  private async readQueue(): Promise<MarketingDraft[]> {
    const path = this.queuePath();
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as MarketingDraft[];
  }

  private async writeQueue(drafts: MarketingDraft[]): Promise<void> {
    const path = this.queuePath();
    const dir = join(
      this.config.tenants_root,
      this.tenantId,
      "state",
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(drafts, null, 2), "utf8");
  }

  async queueForApproval(post: GeneratedPost): Promise<string> {
    const draft_id = randomUUID();
    const draft: MarketingDraft = {
      draft_id,
      tenant_id: this.tenantId,
      status: "pending",
      created_at: new Date().toISOString(),
      post,
    };

    const queue = await this.readQueue();
    queue.push(draft);
    await this.writeQueue(queue);

    return draft_id;
  }

  async approve(draft_id: string): Promise<void> {
    const queue = await this.readQueue();
    const idx = queue.findIndex((d) => d.draft_id === draft_id);
    if (idx === -1) {
      throw new Error(
        `[MarketingSpecialist] Draft not found: ${draft_id}`,
      );
    }
    queue[idx]!.status = "approved";
    queue[idx]!.approved_at = new Date().toISOString();
    await this.writeQueue(queue);
  }

  // ── Core: publish ───────────────────────────────────────────────────────

  async publish(
    draft_id: string,
    channel: string,
  ): Promise<PublishResult> {
    const queue = await this.readQueue();
    const draft = queue.find((d) => d.draft_id === draft_id);

    if (!draft) {
      throw new Error(
        `[MarketingSpecialist] Draft not found: ${draft_id}`,
      );
    }
    if (draft.status !== "approved") {
      throw new Error(
        `[MarketingSpecialist] Draft ${draft_id} is not approved (status=${draft.status}). ` +
          "Call approve() before publish().",
      );
    }

    // Generate image if we haven't already
    const imageResult = await this.generateImage(draft.post.image_prompt);
    const imageUrl = imageResult.url ?? "";

    const adapterFactory = CHANNEL_ADAPTERS[channel];
    if (!adapterFactory) {
      throw new Error(
        `[MarketingSpecialist] No adapter registered for channel "${channel}". ` +
          `Available: ${Object.keys(CHANNEL_ADAPTERS).join(", ")}`,
      );
    }

    const adapter = adapterFactory();
    const external_id = await adapter.publish(draft.post.text, imageUrl);

    const result: PublishResult = {
      external_id,
      channel,
      published_at: new Date().toISOString(),
    };

    // Update queue record
    const idx = queue.findIndex((d) => d.draft_id === draft_id);
    if (idx !== -1) {
      queue[idx]!.status = "published";
      queue[idx]!.published_at = result.published_at;
      queue[idx]!.publish_result = {
        ...queue[idx]!.publish_result,
        [channel]: result,
      };
    }
    await this.writeQueue(queue);

    return result;
  }

  // ── SpecialistAgent.run (bus entry point) ───────────────────────────────

  async run(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const action = payload["action"] as string | undefined;

    switch (action) {
      case "generate": {
        const post = await this.generatePost({
          vertical: (payload["vertical"] as string) ?? this.config.marketing.channels[0] ?? "general",
          vibe: payload["vibe"] as string | undefined,
          business_context: (payload["business_context"] as string) ?? "",
        });
        const draft_id = await this.queueForApproval(post);
        return { draft_id, post };
      }

      case "approve": {
        const draft_id = payload["draft_id"] as string;
        await this.approve(draft_id);
        return { ok: true, draft_id };
      }

      case "publish": {
        const draft_id = payload["draft_id"] as string;
        const channel = (payload["channel"] as string) ?? this.config.marketing.channels[0];
        const result = await this.publish(draft_id, channel!);
        return { ok: true, ...result };
      }

      default:
        throw new Error(
          `[MarketingSpecialist] Unknown action "${action}". Expected: generate | approve | publish`,
        );
    }
  }
}
