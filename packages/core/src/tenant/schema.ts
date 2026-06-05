/**
 * Zod schema for TenantConfig validation.
 *
 * Validates the tenant.json file before it is used by any agent.
 * Throws ZodError on malformed input; callers should catch and surface
 * the error to the owner.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const BusinessVerticalSchema = z.enum([
  'auto-service',
  'home-services',
  'personal-services',
  'food-beverage',
  'retail',
  'professional',
  'fitness',
  'custom',
]);

const ChannelSchema = z.enum([
  'fb-page',
  'instagram-dm',
  'sms-twilio',
  'sms-textnow',
  'sms-generic',
  'email-gmail',
  'email-outlook',
  'email-sendgrid',
  'whatsapp',
  'telegram-owner',
  'web-form',
  'beeper',
]);

const PaymentProcessorSchema = z.enum([
  'square',
  'stripe',
  'paypal',
  'manual',
]);

const ApprovalLevelSchema = z.enum([
  'auto',
  'team_lead_approve',
  'ceo_approve',
  'owner_telegram_confirm',
  'owner_totp',
]);

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const DayHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
});

const BusinessHoursSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
  monday: DayHoursSchema.nullable().optional(),
  tuesday: DayHoursSchema.nullable().optional(),
  wednesday: DayHoursSchema.nullable().optional(),
  thursday: DayHoursSchema.nullable().optional(),
  friday: DayHoursSchema.nullable().optional(),
  saturday: DayHoursSchema.nullable().optional(),
  sunday: DayHoursSchema.nullable().optional(),
  quiet_before: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_after: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const PricingRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  currency: z.string().length(3, 'Must be ISO 4217 3-letter currency code'),
  floor: z.number().nonnegative(),
  ceiling: z.number().positive(),
  auto_quote_band: z.tuple([z.number(), z.number()]),
  requires_lookup: z.boolean().optional(),
  qualifier_question: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (r) => r.floor <= r.ceiling,
  { message: 'floor must be <= ceiling', path: ['floor'] },
).refine(
  (r) => r.auto_quote_band[0] >= r.floor && r.auto_quote_band[1] <= r.ceiling,
  { message: 'auto_quote_band must be within [floor, ceiling]', path: ['auto_quote_band'] },
);

const ApprovalGateSchema = z.object({
  action: z.string().min(1),
  level: ApprovalLevelSchema,
  conditions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const ChannelConfigSchema = z.object({
  type: ChannelSchema,
  enabled: z.boolean(),
  credential_env: z.string().optional(),
  webhook_url: z.string().url().optional(),
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const BrandConfigSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  short_name: z.string().optional(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color #RRGGBB').optional(),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  service_area: z.string().optional(),
  voice_tone: z.string().optional(),
  forbidden_phrases: z.array(z.string()).optional(),
  emoji_policy: z.enum(['none', 'minimal', 'match-customer']).optional(),
});

const ReviewPlatformSchema = z.object({
  type: z.enum(['google', 'facebook', 'yelp', 'trustpilot', 'custom']),
  label: z.string().optional(),
  url: z.string().url(),
});

// ---------------------------------------------------------------------------
// Top-level TenantConfigSchema
// ---------------------------------------------------------------------------

export const TenantConfigSchema = z.object({
  schema_version: z.literal(1),
  tenant_id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'tenant_id must be slug-safe: [a-z0-9_-]'),
  name: z.string().min(1),
  vertical: BusinessVerticalSchema,
  brand: BrandConfigSchema,
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().min(1),
      province_state: z.string().min(1),
      postal_code: z.string().optional(),
      country: z.string().min(1),
    })
    .optional(),
  hours: BusinessHoursSchema,
  channels: z.array(ChannelConfigSchema).min(1, 'At least one channel required'),
  pricing: z.array(PricingRuleSchema),
  approval_gates: z.array(ApprovalGateSchema).optional(),
  payment_processors: z.array(PaymentProcessorSchema).optional(),
  review_platforms: z.array(ReviewPlatformSchema).optional(),
  quiet_hours: z
    .object({
      enabled: z.boolean(),
      respect_business_hours: z.boolean(),
    })
    .optional(),
  shadow_mode: z
    .object({
      enabled: z.boolean(),
      auto_promote_after: z.number().int().positive().optional(),
    })
    .optional(),
  budget: z
    .object({
      daily_usd_cap: z.number().positive().optional(),
      monthly_usd_cap: z.number().positive().optional(),
      alert_at_pct: z.number().min(1).max(100).optional(),
    })
    .optional(),
  connectors: z
    .record(z.record(z.union([z.string(), z.number(), z.boolean()])))
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

export type TenantConfigInput = z.input<typeof TenantConfigSchema>;
export type TenantConfigOutput = z.output<typeof TenantConfigSchema>;

/**
 * Validate raw JSON against TenantConfigSchema.
 * Returns parsed+typed config or throws ZodError.
 */
export function validateTenantConfig(raw: unknown): TenantConfigOutput {
  return TenantConfigSchema.parse(raw);
}

/**
 * Safe variant — returns { success, data, error } instead of throwing.
 */
export function safeParseTenantConfig(raw: unknown): z.SafeParseReturnType<TenantConfigInput, TenantConfigOutput> {
  return TenantConfigSchema.safeParse(raw);
}
