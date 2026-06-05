/**
 * render-persona.ts
 *
 * Renders a Nunjucks persona template with a tenant config + business context.
 * Takes template path (or template string) + tenant config → rendered prompt.
 */

import nunjucks from "nunjucks";
import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

// ─── Tenant Config Schema ─────────────────────────────────────────────────────

export const VoiceConfigSchema = z.object({
  tone: z.enum(["calm-confident", "warm-conversational", "professional-direct"]).default("calm-confident"),
  tagline: z.string().optional(),
});

export const BusinessHoursSchema = z.object({
  open: z.string().default("09:00"),
  close: z.string().default("18:00"),
  timezone: z.string().default("America/Edmonton"),
});

export const BusinessLocationSchema = z.object({
  city: z.string().default("Calgary"),
  region: z.string().default("AB"),
  country: z.string().default("Canada"),
});

export const PricingSchema = z.object({
  floor: z.number().positive(),
  cap: z.number().positive(),
  currency: z.string().default("CAD"),
  default_base: z.number().positive().default(50),
  base_by_service: z.record(z.number()).default({}),
  condition_multipliers: z.record(z.number()).default({}),
  size_multipliers: z.record(z.number()).default({}),
});

export const BookingTemplateConfigSchema = z.object({
  calendar_provider: z.string().default("stub"),
  calendly_url: z.string().optional(),
  default_duration_minutes: z.number().default(60),
  approval_required: z.boolean().default(true),
  high_value_threshold: z.number().optional(),
});

export const QuietHoursSchema = z.object({
  start: z.string().default("22:00"),
  end: z.string().default("08:00"),
});

export const TenantConfigSchema = z.object({
  tenant_id: z.string(),
  business: z.object({
    name: z.string(),
    type: z.string(),
    services: z.array(z.string()),
    hours: BusinessHoursSchema.default({}),
    location: BusinessLocationSchema.default({}),
    brief_time: z.string().default("07:00"),
  }),
  voice: VoiceConfigSchema.default({}),
  pricing: PricingSchema,
  booking: BookingTemplateConfigSchema.default({}),
  quiet_hours: QuietHoursSchema.default({}),
  channels: z.array(z.string()).default(["facebook", "sms"]),
  qualifying_questions: z.array(z.string()).default([]),
  approval_required: z.array(z.string()).default(["quote", "booking"]),
  tenant_brief: z.string().default("you have pending items to review"),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

// ─── Renderer ─────────────────────────────────────────────────────────────────

// Configure Nunjucks with autoescape OFF (we're rendering markdown/text, not HTML)
const env = nunjucks.configure({ autoescape: false, throwOnUndefined: false });

/**
 * Render a persona template (file path or raw string) with the given tenant config.
 * Returns the rendered prompt string.
 */
export function renderPersona(
  templatePathOrString: string,
  config: TenantConfig,
  /** Extra context variables merged on top of the tenant config */
  extraContext: Record<string, unknown> = {}
): string {
  const parsed = TenantConfigSchema.parse(config);

  // Flatten config into top-level template vars
  const ctx: Record<string, unknown> = {
    business: parsed.business,
    voice: parsed.voice,
    pricing: parsed.pricing,
    booking: parsed.booking,
    quiet_hours: parsed.quiet_hours,
    channels: parsed.channels,
    qualifying_questions: parsed.qualifying_questions,
    approval_required: parsed.approval_required,
    tenant_brief: parsed.tenant_brief,
    ...extraContext,
  };

  // Check if it looks like a file path (contains path separators or .md extension)
  const isFilePath =
    templatePathOrString.includes("/") ||
    templatePathOrString.includes("\\") ||
    templatePathOrString.endsWith(".md") ||
    templatePathOrString.endsWith(".txt");

  if (isFilePath) {
    const raw = readFileSync(templatePathOrString, "utf-8");
    return env.renderString(raw, ctx);
  }

  return env.renderString(templatePathOrString, ctx);
}

/**
 * Load a persona template from the built-in templates directory and render it.
 */
export function renderBuiltinPersona(
  templateName: string,
  config: TenantConfig,
  extraContext: Record<string, unknown> = {}
): string {
  const templateDir = join(new URL(".", import.meta.url).pathname, ".");
  const templatePath = join(templateDir, templateName);
  return renderPersona(templatePath, config, extraContext);
}
