/**
 * daily-brief.ts
 *
 * Generates the 8-bullet daily brief for the owner.
 * Pulls from tenant state: pending approvals, hot threads,
 * quotes, bookings, payments, review outcomes, autopilot status.
 */

import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const TenantStateSchema = z.object({
  pendingApprovals: z.array(z.object({ id: z.string(), type: z.string(), summary: z.string() })).default([]),
  hotThreads: z.array(z.object({ customer: z.string(), lastMessage: z.string(), ageHours: z.number() })).default([]),
  quotesSentToday: z.number().default(0),
  quotesAwaitingApproval: z.number().default(0),
  bookingsToday: z.array(z.object({ customer: z.string(), time: z.string(), service: z.string() })).default([]),
  paymentsReceivedToday: z.array(z.object({ amount: z.number(), currency: z.string(), from: z.string() })).default([]),
  paymentsOutstanding: z.number().default(0),
  reviewAsksOutcome: z.object({ sent: z.number(), responded: z.number(), positive: z.number() }).default({ sent: 0, responded: 0, positive: 0 }),
  autopilotEnabled: z.boolean().default(true),
  autopilotChannels: z.array(z.string()).default([]),
  stuckItems: z.array(z.string()).default([]),
  currency: z.string().default("CAD"),
});

export type TenantState = z.infer<typeof TenantStateSchema>;

export interface DailyBriefResult {
  /** 8-bullet plain-text summary for Telegram */
  text: string;
  /** Structured data for artifact/dashboard rendering */
  data: TenantState;
  /** Optional artifact link if content overflows 200 tokens */
  artifactLink: string | null;
  generatedAt: string;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateDailyBrief(state: TenantState, businessName: string): DailyBriefResult {
  const parsed = TenantStateSchema.parse(state);

  const bullets: string[] = [];

  // 1. Inbound messages
  const hotCount = parsed.hotThreads.length;
  bullets.push(
    hotCount > 0
      ? `${hotCount} active thread${hotCount > 1 ? "s" : ""} — hottest: ${parsed.hotThreads[0]?.customer ?? "unknown"} (${parsed.hotThreads[0]?.ageHours?.toFixed(0)}h ago)`
      : "No new inbound messages since yesterday"
  );

  // 2. Quotes
  bullets.push(
    parsed.quotesAwaitingApproval > 0
      ? `${parsed.quotesSentToday} quote${parsed.quotesSentToday !== 1 ? "s" : ""} sent today — ${parsed.quotesAwaitingApproval} awaiting your approval`
      : `${parsed.quotesSentToday} quote${parsed.quotesSentToday !== 1 ? "s" : ""} sent today, none awaiting approval`
  );

  // 3. Bookings
  const bookCount = parsed.bookingsToday.length;
  if (bookCount > 0) {
    const bookSummary = parsed.bookingsToday.map(b => `${b.customer} @ ${b.time}`).join(", ");
    bullets.push(`${bookCount} booking${bookCount > 1 ? "s" : ""} today: ${bookSummary}`);
  } else {
    bullets.push("No bookings today");
  }

  // 4. Payments
  const totalReceived = parsed.paymentsReceivedToday.reduce((sum, p) => sum + p.amount, 0);
  const curr = parsed.currency;
  bullets.push(
    totalReceived > 0
      ? `${curr} ${totalReceived.toFixed(2)} received today${parsed.paymentsOutstanding > 0 ? ` — ${curr} ${parsed.paymentsOutstanding.toFixed(2)} outstanding` : ""}`
      : `No payments today${parsed.paymentsOutstanding > 0 ? ` — ${curr} ${parsed.paymentsOutstanding.toFixed(2)} outstanding` : ""}`
  );

  // 5. Review asks
  const { sent, responded, positive } = parsed.reviewAsksOutcome;
  bullets.push(
    sent > 0
      ? `Review asks: ${sent} sent, ${responded} responded, ${positive} positive`
      : "No review asks sent yet"
  );

  // 6. Hot threads needing attention
  const stuckThreads = parsed.hotThreads.filter(t => t.ageHours > 4);
  bullets.push(
    stuckThreads.length > 0
      ? `${stuckThreads.length} thread${stuckThreads.length > 1 ? "s" : ""} stuck >4h: ${stuckThreads.map(t => t.customer).join(", ")}`
      : "No stuck threads"
  );

  // 7. Autopilot status
  bullets.push(
    parsed.autopilotEnabled
      ? `Autopilot ON — active on: ${parsed.autopilotChannels.join(", ") || "all configured channels"}`
      : "Autopilot PAUSED — no automated outbound until you resume"
  );

  // 8. Pending approvals / recommended action
  const pendingCount = parsed.pendingApprovals.length;
  if (pendingCount > 0) {
    const first = parsed.pendingApprovals[0];
    bullets.push(`${pendingCount} item${pendingCount > 1 ? "s" : ""} need your approval — first: ${first?.summary ?? first?.type}`);
  } else if (parsed.stuckItems.length > 0) {
    bullets.push(`Recommended: ${parsed.stuckItems[0]}`);
  } else {
    bullets.push("Everything on track. No action required today.");
  }

  const text = `${businessName} — ${new Date().toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}\n\n` +
    bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");

  // Rough token estimate: ~1 token per 4 chars
  const tokenEstimate = text.length / 4;
  const artifactLink = tokenEstimate > 200 ? "[artifact-link-stub]" : null;

  return {
    text,
    data: parsed,
    artifactLink,
    generatedAt: new Date().toISOString(),
  };
}
