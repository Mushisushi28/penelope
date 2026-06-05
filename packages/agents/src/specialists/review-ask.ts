/**
 * review-ask.ts
 *
 * After a job is paid: wait the configured delay, then send a review-ask
 * via the appropriate channel (SMS, email, FB, or Telegram tap-to-send).
 *
 * Pattern: tap-to-send link to owner Telegram for confirmation before send.
 */

import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ReviewPlatformSchema = z.enum(["google", "facebook", "yelp", "custom"]);
export type ReviewPlatform = z.infer<typeof ReviewPlatformSchema>;

export const ReviewConfigSchema = z.object({
  /** Platforms in priority order */
  platforms: z.array(
    z.object({
      name: ReviewPlatformSchema,
      url: z.string().url(),
    })
  ).min(1),
  /** Delay in minutes after payment before sending review ask */
  delay_minutes: z.number().int().nonneg().default(60),
  /** Whether owner must approve before sending (tap-to-send pattern) */
  approval_required: z.boolean().default(false),
  /** Maximum review asks per customer (prevents spam) */
  max_per_customer: z.number().int().positive().default(1),
});

export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;

export const ReviewAskRequestSchema = z.object({
  customer_name: z.string(),
  customer_channel: z.enum(["sms", "email", "facebook", "instagram", "telegram"]),
  customer_contact: z.string(), // phone, email, or platform-specific ID
  job_id: z.string(),
  payment_id: z.string(),
  business_name: z.string(),
  /** ISO datetime when payment was confirmed */
  payment_confirmed_at: z.string(),
});

export type ReviewAskRequest = z.infer<typeof ReviewAskRequestSchema>;

export const ReviewAskResultSchema = z.object({
  scheduled: z.boolean(),
  send_at: z.string().optional(), // ISO datetime
  message_preview: z.string(),
  review_url: z.string(),
  requires_approval: z.boolean(),
  /** Telegram tap-to-send link for owner approval */
  approval_link: z.string().optional(),
  skipped: z.boolean().default(false),
  skip_reason: z.string().optional(),
});

export type ReviewAskResult = z.infer<typeof ReviewAskResultSchema>;

// ─── Message Templates ────────────────────────────────────────────────────────

const TEMPLATES: Record<string, (customerName: string, businessName: string, reviewUrl: string) => string> = {
  sms: (n, b, url) =>
    `Hi ${n}! Thanks for choosing ${b}. If you're happy with the work, a quick review would mean the world to us: ${url} 🙏`,
  email: (n, b, url) =>
    `Hi ${n},\n\nThank you for trusting us at ${b}! We hope you're thrilled with the results. If you have a moment, we'd really appreciate a review — it helps us help more customers like you.\n\n${url}\n\nThanks again,\n${b}`,
  facebook: (n, b, url) =>
    `Hey ${n}! Really glad we could help at ${b}. Would you mind leaving us a quick review? It means a lot: ${url}`,
  instagram: (n, b, url) =>
    `Thanks ${n}! Hope you love the results from ${b}. If you have a sec, we'd appreciate a review here: ${url}`,
  telegram: (n, b, url) =>
    `Hey ${n}, thanks for choosing ${b}! Quick favour — would you leave us a review? ${url}`,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export function scheduleReviewAsk(
  request: ReviewAskRequest,
  config: ReviewConfig
): ReviewAskResult {
  const platform = config.platforms[0];
  if (!platform) {
    return ReviewAskResultSchema.parse({
      scheduled: false,
      message_preview: "",
      review_url: "",
      requires_approval: false,
      skipped: true,
      skip_reason: "No review platforms configured",
    });
  }

  const paymentTime = new Date(request.payment_confirmed_at);
  const sendAt = new Date(paymentTime.getTime() + config.delay_minutes * 60 * 1000);

  const templateFn = TEMPLATES[request.customer_channel] ?? TEMPLATES.sms!;
  const message = templateFn(request.customer_name, request.business_name, platform.url);

  // Build tap-to-send approval link for owner (Telegram deep link pattern)
  const approvalToken = Buffer.from(
    JSON.stringify({ job_id: request.job_id, payment_id: request.payment_id, send_at: sendAt.toISOString() })
  ).toString("base64url");
  const approvalLink = config.approval_required
    ? `penelope://review-ask/approve/${approvalToken}`
    : undefined;

  return ReviewAskResultSchema.parse({
    scheduled: true,
    send_at: sendAt.toISOString(),
    message_preview: message,
    review_url: platform.url,
    requires_approval: config.approval_required,
    approval_link: approvalLink,
    skipped: false,
  });
}
