/**
 * quote-builder.ts
 *
 * Receives a structured job description + tenant pricing rules →
 * computes a quote within floor/cap guardrails.
 */

import { z } from "zod";
import { randomUUID } from "crypto";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const PricingConfigSchema = z.object({
  floor: z.number().positive(),
  cap: z.number().positive(),
  currency: z.string().default("CAD"),
  default_base: z.number().positive().default(50),
  base_by_service: z.record(z.number()).default({}),
  condition_multipliers: z
    .object({
      light: z.number().default(1.0),
      moderate: z.number().default(1.2),
      heavy: z.number().default(1.5),
      extreme: z.number().default(2.0),
    })
    .partial()
    .default({}),
  size_multipliers: z
    .object({
      car: z.number().default(1.0),
      suv: z.number().default(1.1),
      truck: z.number().default(1.15),
      van: z.number().default(1.2),
      motorcycle: z.number().default(0.85),
    })
    .partial()
    .default({}),
});

export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const JobInputSchema = z.object({
  service_type: z.string(),
  vehicle_size: z.enum(["car", "suv", "truck", "van", "motorcycle"]).default("car"),
  condition: z.enum(["light", "moderate", "heavy", "extreme"]).default("moderate"),
  quantity: z.number().int().positive().default(1),
  notes: z.string().optional(),
});

export type JobInput = z.infer<typeof JobInputSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  unit_price: z.number(),
  quantity: z.number(),
  total: z.number(),
});

export const QuoteResultSchema = z.object({
  quote_id: z.string(),
  line_items: z.array(LineItemSchema),
  subtotal: z.number(),
  final_price: z.number(),
  currency: z.string(),
  formula_trace: z.object({
    base: z.number(),
    condition_mod: z.number(),
    size_mod: z.number(),
    quantity_mod: z.number(),
    clamped: z.boolean(),
  }),
  capped: z.boolean(),
  cap_reason: z.string().nullable(),
  notes: z.string(),
});

export type QuoteResult = z.infer<typeof QuoteResultSchema>;

export interface QuoteError {
  error: "missing_fields" | "config_error" | "below_floor";
  missing?: string[];
  detail?: string;
}

// ─── Formula ──────────────────────────────────────────────────────────────────

/**
 * Map quantity to a quantity modifier.
 * Single item: 1.0, pair: 1.8, triple: 2.6, quad: 3.2, beyond: linear
 */
function quantityMod(qty: number): number {
  if (qty === 1) return 1.0;
  if (qty === 2) return 1.8;
  if (qty === 3) return 2.6;
  if (qty === 4) return 3.2;
  return 3.2 + (qty - 4) * 0.8;
}

/**
 * Build a quote from job inputs + tenant pricing config.
 */
export function buildQuote(
  job: JobInput,
  pricing: PricingConfig
): QuoteResult | QuoteError {
  // Resolve base price
  const base =
    pricing.base_by_service[job.service_type] ?? pricing.default_base;

  // Resolve multipliers (fall back to 1.0)
  const condMods = { light: 1.0, moderate: 1.2, heavy: 1.5, extreme: 2.0, ...pricing.condition_multipliers };
  const sizeMods = { car: 1.0, suv: 1.1, truck: 1.15, van: 1.2, motorcycle: 0.85, ...pricing.size_multipliers };

  const cond_mod = condMods[job.condition] ?? 1.0;
  const size_mod = sizeMods[job.vehicle_size] ?? 1.0;
  const qty_mod = quantityMod(job.quantity);

  const subtotal = base * cond_mod * size_mod * qty_mod;

  // Clamp to floor/cap
  let final_price = subtotal;
  let clamped = false;
  let capped = false;
  let cap_reason: string | null = null;

  if (final_price < pricing.floor) {
    final_price = pricing.floor;
    clamped = true;
  }
  if (final_price > pricing.cap) {
    final_price = pricing.cap;
    clamped = true;
    capped = true;
    cap_reason = `Computed price ${subtotal.toFixed(2)} exceeds cap ${pricing.cap}. Owner approval required.`;
  }

  // Build line items
  const itemLabel = job.quantity === 1 ? "unit" : `set of ${job.quantity}`;
  const line_items = [
    {
      description: `${job.service_type} (${job.vehicle_size}, ${job.condition} condition) — ${itemLabel}`,
      unit_price: base,
      quantity: job.quantity,
      total: round2(final_price),
    },
  ];

  return QuoteResultSchema.parse({
    quote_id: randomUUID(),
    line_items,
    subtotal: round2(subtotal),
    final_price: round2(final_price),
    currency: pricing.currency,
    formula_trace: {
      base: round2(base),
      condition_mod: cond_mod,
      size_mod: size_mod,
      quantity_mod: round2(qty_mod),
      clamped,
    },
    capped,
    cap_reason,
    notes: job.notes ?? "",
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a natural-language job description into a structured JobInput.
 * This is a best-effort heuristic — the LLM layer should pre-parse for accuracy.
 */
export function parseJobDescription(raw: string): Partial<JobInput> {
  const lower = raw.toLowerCase();

  // Vehicle size detection
  let vehicle_size: JobInput["vehicle_size"] = "car";
  if (/truck|pickup|f-?150|silverado|ram\b/i.test(raw)) vehicle_size = "truck";
  else if (/suv|crossover|4runner|explorer|tahoe|yukon|expedition/i.test(raw)) vehicle_size = "suv";
  else if (/van|transit|caravan|minivan/i.test(raw)) vehicle_size = "van";
  else if (/moto|motorcycle|bike/i.test(raw)) vehicle_size = "motorcycle";

  // Condition detection — use word boundaries to avoid matching "headlight" as "light"
  let condition: JobInput["condition"] = "moderate";
  if (/\b(?:light|mild|slight|minor)\s+(?:haze|oxidation|yellowing|condition|scratch|wear)/i.test(raw)) condition = "light";
  else if (/\b(?:heavy|severe|bad|really|very)\b/i.test(raw)) condition = "heavy";
  else if (/\b(?:extreme|totally|completely|destroyed|awful)\b/i.test(raw)) condition = "extreme";

  // Quantity detection
  let quantity = 1;
  if (/pair|both|two|2\s+head/i.test(raw)) quantity = 2;
  else if (/triple|three|3\s+head/i.test(raw)) quantity = 3;
  else if (/quad|four|4\s+head/i.test(raw)) quantity = 4;

  return { vehicle_size, condition, quantity, notes: raw };
}
