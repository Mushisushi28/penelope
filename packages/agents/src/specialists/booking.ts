/**
 * booking.ts
 *
 * Booking specialist — checks availability and creates calendar events.
 * Real calendar integrations (Google Calendar, Calendly) are stubbed.
 * Wire real OAuth tokens via tenant config to activate.
 */

import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const BookingConfigSchema = z.object({
  calendar_provider: z.enum(["google-calendar", "calendly", "stub"]).default("stub"),
  calendly_url: z.string().url().optional(),
  default_duration_minutes: z.number().int().positive().default(60),
  approval_required: z.boolean().default(true),
  high_value_threshold: z.number().optional(),
  timezone: z.string().default("America/Edmonton"),
});

export type BookingConfig = z.infer<typeof BookingConfigSchema>;

export const SlotSchema = z.object({
  start: z.string(), // ISO datetime
  end: z.string(),   // ISO datetime
  available: z.boolean(),
});

export type Slot = z.infer<typeof SlotSchema>;

export const BookingRequestSchema = z.object({
  customer_name: z.string(),
  customer_contact: z.string(),
  service: z.string(),
  requested_window_start: z.string(), // ISO datetime
  requested_window_end: z.string(),   // ISO datetime
  quote_id: z.string().optional(),
  notes: z.string().optional(),
});

export type BookingRequest = z.infer<typeof BookingRequestSchema>;

export const BookingResultSchema = z.object({
  booked: z.boolean(),
  slot: SlotSchema.optional(),
  event_id: z.string().optional(),
  alternatives: z.array(SlotSchema).default([]),
  requires_owner_approval: z.boolean(),
  approval_token: z.string().optional(),
  message: z.string(),
});

export type BookingResult = z.infer<typeof BookingResultSchema>;

// ─── Stub Calendar Provider ───────────────────────────────────────────────────

/**
 * Stub: returns mock available slots within the requested window.
 * Replace with real Google Calendar / Calendly API calls.
 */
async function getAvailableSlots(
  config: BookingConfig,
  windowStart: Date,
  windowEnd: Date,
  durationMinutes: number
): Promise<Slot[]> {
  // Stub: return 3 evenly spaced slots within the window
  const slots: Slot[] = [];
  const range = windowEnd.getTime() - windowStart.getTime();
  const step = Math.floor(range / 4);

  for (let i = 1; i <= 3; i++) {
    const start = new Date(windowStart.getTime() + step * i);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    if (end <= windowEnd) {
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        available: true,
      });
    }
  }

  return slots;
}

/**
 * Stub: create a calendar event. Returns a mock event ID.
 * Replace with real Google Calendar API or Calendly booking.
 */
async function createCalendarEvent(
  config: BookingConfig,
  request: BookingRequest,
  slot: Slot
): Promise<string> {
  // TODO: wire Google Calendar OAuth or Calendly API
  const eventId = `stub-event-${Date.now()}`;
  console.log(`[booking] STUB creating event ${eventId} at ${slot.start}`);
  return eventId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function processBookingRequest(
  request: BookingRequest,
  config: BookingConfig
): Promise<BookingResult> {
  const durationMinutes = config.default_duration_minutes;
  const windowStart = new Date(request.requested_window_start);
  const windowEnd = new Date(request.requested_window_end);

  // Validate window
  if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
    return BookingResultSchema.parse({
      booked: false,
      requires_owner_approval: config.approval_required,
      message: "Invalid date window provided.",
    });
  }

  if (windowEnd <= windowStart) {
    return BookingResultSchema.parse({
      booked: false,
      requires_owner_approval: config.approval_required,
      message: "Window end must be after window start.",
    });
  }

  const slots = await getAvailableSlots(config, windowStart, windowEnd, durationMinutes);

  if (slots.length === 0) {
    return BookingResultSchema.parse({
      booked: false,
      requires_owner_approval: config.approval_required,
      message: "No availability in the requested window.",
    });
  }

  // If owner approval required, return first slot as proposal
  if (config.approval_required) {
    return BookingResultSchema.parse({
      booked: false,
      slot: slots[0],
      alternatives: slots.slice(1),
      requires_owner_approval: true,
      approval_token: `approve-${Date.now()}`,
      message: `Proposed slot: ${slots[0].start}. Awaiting owner approval.`,
    });
  }

  // Auto-book first available slot
  const slot = slots[0];
  const event_id = await createCalendarEvent(config, request, slot);

  return BookingResultSchema.parse({
    booked: true,
    slot,
    event_id,
    requires_owner_approval: false,
    message: `Booked: ${request.customer_name} for ${request.service} at ${slot.start}`,
  });
}
