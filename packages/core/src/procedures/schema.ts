/**
 * Zod schema for Procedure YAML validation.
 *
 * All step kinds must be explicitly listed here.
 * Unknown step kinds cause a ZodError — this is intentional.
 * Specialists refuse to spawn with a malformed procedure.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const ApprovalLevelSchema = z.enum([
  'auto',
  'team_lead_approve',
  'ceo_approve',
  'owner_telegram_confirm',
  'owner_totp',
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

// ---------------------------------------------------------------------------
// Step schemas
// ---------------------------------------------------------------------------

const BaseStepSchema = z.object({
  kind: z.string(),  // narrowed per variant
  label: z.string().optional(),
  approval: ApprovalLevelSchema.optional(),
  optional: z.boolean().optional(),
});

const SendMessageStepSchema = BaseStepSchema.extend({
  kind: z.literal('send_message'),
  template: z.string().min(1),
  channel: ChannelSchema.optional(),
});

const AskQuestionStepSchema = BaseStepSchema.extend({
  kind: z.literal('ask_question'),
  question: z.string().min(1),
  store_as: z.string().min(1),
  channel: ChannelSchema.optional(),
});

const ComputeQuoteStepSchema = BaseStepSchema.extend({
  kind: z.literal('compute_quote'),
  pricing_rule_id: z.string().min(1),
  store_as: z.string().min(1),
  out_of_band_approval: ApprovalLevelSchema.optional(),
});

const LookupExternalStepSchema = BaseStepSchema.extend({
  kind: z.literal('lookup_external'),
  service: z.string().min(1),
  query_template: z.string().min(1),
  store_as: z.string().min(1),
});

const SetStateStepSchema = BaseStepSchema.extend({
  kind: z.literal('set_state'),
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const ScheduleFollowupStepSchema = BaseStepSchema.extend({
  kind: z.literal('schedule_followup'),
  delay: z.string().regex(/^P/, 'Must be ISO 8601 duration, e.g. PT1H or P1D'),
  invoke_procedure: z.string().min(1),
  inputs: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const EmitBusEventStepSchema = BaseStepSchema.extend({
  kind: z.literal('emit_bus_event'),
  event_type: z.string().min(1),
  payload_template: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const EscalateStepSchema = BaseStepSchema.extend({
  kind: z.literal('escalate'),
  to: z.string().min(1),
  reason: z.string().min(1),
  include_context: z.boolean().optional(),
});

const WaitForEventStepSchema = BaseStepSchema.extend({
  kind: z.literal('wait_for_event'),
  event_type: z.string().min(1),
  timeout: z.string().regex(/^P/, 'Must be ISO 8601 duration'),
  on_timeout: z.string().optional(),
});

const OfferBookingLinkStepSchema = BaseStepSchema.extend({
  kind: z.literal('offer_booking_link'),
  provider: z.enum(['calendly', 'gcal', 'manual']),
  url_template: z.string().optional(),
  message_template: z.string().optional(),
  channel: ChannelSchema.optional(),
});

const MarkJobStatusStepSchema = BaseStepSchema.extend({
  kind: z.literal('mark_job_status'),
  status: z.enum(['new', 'qualifying', 'quoted', 'booked', 'paid', 'closed', 'lost']),
});

const SendReviewRequestStepSchema = BaseStepSchema.extend({
  kind: z.literal('send_review_request'),
  platform: z.enum(['google', 'facebook', 'yelp', 'custom']),
  url_template: z.string().min(1),
  message_template: z.string().min(1),
  channel: ChannelSchema,
  delay: z.string().regex(/^P/).optional(),
});

const SendInvoiceStepSchema = BaseStepSchema.extend({
  kind: z.literal('send_invoice'),
  processor: z.enum(['square', 'stripe', 'paypal', 'manual']),
  amount_from_context: z.string().optional(),
  channel: ChannelSchema.optional(),
});

const LogAuditStepSchema = BaseStepSchema.extend({
  kind: z.literal('log_audit'),
  event: z.string().min(1),
  detail_template: z.string().optional(),
});

/**
 * Discriminated union of all step schemas.
 * Adding a new step kind: add it here + to ProcedureStep union in types.ts.
 */
export const ProcedureStepSchema = z.discriminatedUnion('kind', [
  SendMessageStepSchema,
  AskQuestionStepSchema,
  ComputeQuoteStepSchema,
  LookupExternalStepSchema,
  SetStateStepSchema,
  ScheduleFollowupStepSchema,
  EmitBusEventStepSchema,
  EscalateStepSchema,
  WaitForEventStepSchema,
  OfferBookingLinkStepSchema,
  MarkJobStatusStepSchema,
  SendReviewRequestStepSchema,
  SendInvoiceStepSchema,
  LogAuditStepSchema,
]);

// ---------------------------------------------------------------------------
// State schema
// ---------------------------------------------------------------------------

export const ProcedureStateSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, 'State id must be lowercase slug'),
  label: z.string().optional(),
  when: z.array(z.string()).optional(),
  actions: z.array(ProcedureStepSchema).min(1, 'Each state must have at least one action'),
  next: z.string().optional(),
  approval: ApprovalLevelSchema.optional(),
});

// ---------------------------------------------------------------------------
// Top-level Procedure schema
// ---------------------------------------------------------------------------

const TriggerKindSchema = z.enum([
  'inbound_message',
  'bus_event',
  'schedule',
  'payment_received',
  'job_status_change',
  'manual',
]);

const ProcedureTriggerSchema = z.object({
  kind: TriggerKindSchema,
  channel: ChannelSchema.optional(),
  event_type: z.string().optional(),
  cron: z.string().optional(),
  conditions: z.array(z.string()).optional(),
});

export const ProcedureSchema = z.object({
  schema_version: z.literal(1),
  procedure_id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'procedure_id must be slug-safe'),
  description: z.string().optional(),
  owner_team: z.string().min(1),
  specialist_class: z.string().min(1),
  trigger: ProcedureTriggerSchema,
  inputs: z.object({
    required: z.array(z.string()),
    optional: z.array(z.string()).optional(),
  }),
  runtime_budget: z
    .object({
      max_tokens_per_run: z.number().int().positive().optional(),
      max_usd_per_run: z.number().positive().optional(),
      max_runs_per_thread_per_day: z.number().int().positive().optional(),
    })
    .optional(),
  brand_voice: z
    .object({
      tone: z.string().optional(),
      forbidden_phrases: z.array(z.string()).optional(),
      emoji_policy: z.enum(['none', 'minimal', 'match-customer']).optional(),
      signature: z.string().optional(),
    })
    .optional(),
  states: z.array(ProcedureStateSchema).min(1, 'At least one state is required'),
  outputs: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).optional(),
});

export type ProcedureInput = z.input<typeof ProcedureSchema>;
export type ProcedureOutput = z.output<typeof ProcedureSchema>;

/**
 * Validate a raw parsed YAML object against ProcedureSchema.
 * Throws ZodError on malformed input.
 */
export function validateProcedure(raw: unknown): ProcedureOutput {
  return ProcedureSchema.parse(raw);
}

export function safeParseProcedure(raw: unknown): z.SafeParseReturnType<ProcedureInput, ProcedureOutput> {
  return ProcedureSchema.safeParse(raw);
}
