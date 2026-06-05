/**
 * marketing.ts
 *
 * Queues approved marketing content for publishing via channel adapters.
 * Draft generation is handled by the marketing persona template (LLM).
 * This module handles the approval gate and scheduling logic.
 */

import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ContentTypeSchema = z.enum([
  "social-post",
  "sms-campaign",
  "email-campaign",
  "before-after-caption",
  "promotional-offer",
]);

export const TargetPlatformSchema = z.enum([
  "facebook",
  "instagram",
  "google-business",
  "sms",
  "email",
]);

export const ContentDraftSchema = z.object({
  draft_id: z.string(),
  type: ContentTypeSchema,
  platforms: z.array(TargetPlatformSchema).min(1),
  body: z.string(),
  image_prompt: z.string().optional(),
  created_at: z.string(),
  topic: z.string().optional(),
});

export type ContentDraft = z.infer<typeof ContentDraftSchema>;

export const ApprovalStateSchema = z.enum(["pending", "approved", "rejected", "edited"]);

export const QueuedContentSchema = z.object({
  draft: ContentDraftSchema,
  approval_state: ApprovalStateSchema.default("pending"),
  approved_at: z.string().optional(),
  edited_body: z.string().optional(),
  scheduled_for: z.string().optional(), // ISO datetime, null = ASAP
  published_at: z.string().optional(),
  published: z.boolean().default(false),
});

export type QueuedContent = z.infer<typeof QueuedContentSchema>;

export const MarketingConfigSchema = z.object({
  enabled_platforms: z.array(TargetPlatformSchema).default(["facebook"]),
  approval_required: z.boolean().default(true),
  /** Max posts per platform per day */
  daily_post_limit: z.number().int().positive().default(2),
});

export type MarketingConfig = z.infer<typeof MarketingConfigSchema>;

// ─── In-memory queue (stub — replace with tenant DB) ──────────────────────────

const _queue: QueuedContent[] = [];

// ─── Operations ───────────────────────────────────────────────────────────────

/**
 * Queue a newly drafted content piece for owner approval.
 */
export function queueForApproval(draft: ContentDraft): QueuedContent {
  const entry = QueuedContentSchema.parse({
    draft,
    approval_state: "pending",
  });
  _queue.push(entry);
  return entry;
}

/**
 * Record owner approval (Y) or rejection (N) for a queued draft.
 * Optional edited_body: owner pasted inline edits.
 */
export function recordApproval(
  draft_id: string,
  approved: boolean,
  edited_body?: string
): QueuedContent | null {
  const entry = _queue.find(e => e.draft.draft_id === draft_id);
  if (!entry) return null;

  entry.approval_state = approved ? (edited_body ? "edited" : "approved") : "rejected";
  if (approved) {
    entry.approved_at = new Date().toISOString();
    if (edited_body) entry.edited_body = edited_body;
  }
  return entry;
}

/**
 * Get all pending approval items (for owner daily brief).
 */
export function getPendingApprovals(): QueuedContent[] {
  return _queue.filter(e => e.approval_state === "pending");
}

/**
 * Publish approved content via the appropriate channel adapter.
 * Stub: logs the publish intent. Real impl calls channel adapter.
 */
export async function publishApproved(
  config: MarketingConfig
): Promise<{ published: number; errors: string[] }> {
  const approved = _queue.filter(
    e => (e.approval_state === "approved" || e.approval_state === "edited") && !e.published
  );

  const errors: string[] = [];
  let published = 0;

  for (const entry of approved) {
    const body = entry.edited_body ?? entry.draft.body;
    for (const platform of entry.draft.platforms) {
      if (!config.enabled_platforms.includes(platform)) {
        errors.push(`Platform ${platform} not enabled for this tenant`);
        continue;
      }
      try {
        // TODO: call channel adapter for each platform
        console.log(`[marketing] STUB publishing to ${platform}: ${body.slice(0, 80)}...`);
        entry.published = true;
        entry.published_at = new Date().toISOString();
        published++;
      } catch (err) {
        errors.push(`Publish to ${platform} failed: ${String(err)}`);
      }
    }
  }

  return { published, errors };
}
