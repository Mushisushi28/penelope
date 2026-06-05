/**
 * payment-reconciler.ts
 *
 * Polls Square/Stripe for new payments, matches to open jobs,
 * marks jobs paid, and triggers review-ask flow.
 *
 * Pattern: reference_payment_nudge_poller.md (generalized for any tenant).
 * Real API keys are loaded from tenant .env; stubs used when not present.
 */

import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const PaymentProviderConfigSchema = z.object({
  provider: z.enum(["square", "stripe", "stub"]).default("stub"),
  /** Square access token — from tenant .env */
  square_access_token: z.string().optional(),
  /** Square location ID */
  square_location_id: z.string().optional(),
  /** Stripe secret key — from tenant .env */
  stripe_secret_key: z.string().optional(),
  /** Minimum payment amount to trigger review-ask (in minor units) */
  review_ask_threshold_cents: z.number().int().default(0),
});

export type PaymentProviderConfig = z.infer<typeof PaymentProviderConfigSchema>;

export const PaymentRecordSchema = z.object({
  payment_id: z.string(),
  provider: z.string(),
  amount_cents: z.number().int(),
  currency: z.string(),
  customer_name: z.string().nullable(),
  customer_email: z.string().nullable(),
  customer_phone: z.string().nullable(),
  created_at: z.string(),
  job_id: z.string().nullable(),
  matched: z.boolean().default(false),
  review_ask_queued: z.boolean().default(false),
});

export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

export const ReconcileResultSchema = z.object({
  checked_at: z.string(),
  provider: z.string(),
  payments_found: z.number(),
  newly_matched: z.number(),
  review_asks_queued: z.number(),
  payments: z.array(PaymentRecordSchema),
  errors: z.array(z.string()).default([]),
});

export type ReconcileResult = z.infer<typeof ReconcileResultSchema>;

// ─── Stub Provider ────────────────────────────────────────────────────────────

async function fetchPaymentsStub(sinceIso: string): Promise<PaymentRecord[]> {
  // Stub: returns empty list — no payments since last check
  console.log(`[payment-reconciler] STUB: would fetch payments since ${sinceIso}`);
  return [];
}

async function fetchPaymentsSquare(
  accessToken: string,
  locationId: string,
  sinceIso: string
): Promise<PaymentRecord[]> {
  // TODO: replace with real Square /v2/payments call
  // const resp = await fetch(`https://connect.squareup.com/v2/payments?location_id=${locationId}&begin_time=${sinceIso}`, {
  //   headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-01-18' }
  // });
  // const { payments } = await resp.json();
  // return payments.map(mapSquarePayment);
  console.log("[payment-reconciler] STUB: Square API not wired — returning empty");
  return [];
}

async function fetchPaymentsStripe(
  secretKey: string,
  sinceTimestamp: number
): Promise<PaymentRecord[]> {
  // TODO: replace with real Stripe /v1/charges or /v1/payment_intents call
  console.log("[payment-reconciler] STUB: Stripe API not wired — returning empty");
  return [];
}

// ─── Job matching ─────────────────────────────────────────────────────────────

/**
 * Match a payment to an open job in the tenant DB.
 * Stub: returns null (no match). Real impl queries jobs by customer phone/email + amount.
 */
async function matchPaymentToJob(payment: PaymentRecord): Promise<string | null> {
  // TODO: query tenant DB
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function reconcilePayments(
  config: PaymentProviderConfig,
  sinceIso: string
): Promise<ReconcileResult> {
  const errors: string[] = [];
  let payments: PaymentRecord[] = [];

  try {
    switch (config.provider) {
      case "square":
        if (!config.square_access_token || !config.square_location_id) {
          errors.push("Square config missing access_token or location_id");
          payments = await fetchPaymentsStub(sinceIso);
        } else {
          payments = await fetchPaymentsSquare(
            config.square_access_token,
            config.square_location_id,
            sinceIso
          );
        }
        break;

      case "stripe":
        if (!config.stripe_secret_key) {
          errors.push("Stripe config missing secret_key");
          payments = await fetchPaymentsStub(sinceIso);
        } else {
          payments = await fetchPaymentsStripe(
            config.stripe_secret_key,
            Math.floor(new Date(sinceIso).getTime() / 1000)
          );
        }
        break;

      default:
        payments = await fetchPaymentsStub(sinceIso);
    }
  } catch (err) {
    errors.push(`Fetch error: ${String(err)}`);
  }

  let newly_matched = 0;
  let review_asks_queued = 0;

  for (const payment of payments) {
    if (!payment.matched) {
      const job_id = await matchPaymentToJob(payment);
      if (job_id) {
        payment.job_id = job_id;
        payment.matched = true;
        newly_matched++;
      }
    }

    // Queue review ask if above threshold
    if (
      payment.matched &&
      !payment.review_ask_queued &&
      payment.amount_cents >= config.review_ask_threshold_cents
    ) {
      payment.review_ask_queued = true;
      review_asks_queued++;
      // TODO: post review-ask job to bus with 1h delay
    }
  }

  return ReconcileResultSchema.parse({
    checked_at: new Date().toISOString(),
    provider: config.provider,
    payments_found: payments.length,
    newly_matched,
    review_asks_queued,
    payments,
    errors,
  });
}
