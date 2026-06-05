/**
 * Bus-event subscriber middleware that increments TenantMeter counters.
 *
 * Wire this up after the bus is initialised:
 *   const sub = new TelemetryMiddleware(meter);
 *   bus.on("*", (event) => sub.handle(event));
 */

import type { TenantMeter } from "./meter.js";

export interface BusEvent {
  type: string;
  payload?: Record<string, unknown>;
}

/** Events the middleware reacts to. Extend as new bus events land. */
const EVENT_HANDLERS: Record<
  string,
  (meter: TenantMeter, payload: Record<string, unknown>) => void
> = {
  "message.handled": (meter) => {
    meter.increment("messages_handled");
  },
  "draft.created": (meter) => {
    meter.increment("drafts_pending");
  },
  "draft.sent": (meter) => {
    // A draft was sent — decrement pending; floor at 0.
    const current = meter.get("drafts_pending");
    meter.set("drafts_pending", Math.max(0, current - 1));
  },
  "draft.discarded": (meter) => {
    const current = meter.get("drafts_pending");
    meter.set("drafts_pending", Math.max(0, current - 1));
  },
  "tokens.consumed": (meter, payload) => {
    const count = typeof payload["count"] === "number" ? payload["count"] : 0;
    if (count > 0) meter.increment("ai_tokens_used", count);
  },
  "channel.connected": (meter) => {
    const current = meter.get("channels_active");
    meter.set("channels_active", current + 1);
  },
  "channel.disconnected": (meter) => {
    const current = meter.get("channels_active");
    meter.set("channels_active", Math.max(0, current - 1));
  },
  "agent.started": (meter) => {
    meter.startSession();
  },
  "agent.stopped": (meter) => {
    meter.stopSession();
  },
};

export class TelemetryMiddleware {
  constructor(private readonly meter: TenantMeter) {}

  handle(event: BusEvent): void {
    const handler = EVENT_HANDLERS[event.type];
    if (handler) {
      handler(this.meter, event.payload ?? {});
    }
  }

  /** Convenience: register against any EventEmitter-like bus. */
  attach(bus: { on: (event: string, handler: (e: BusEvent) => void) => void }): void {
    bus.on("*", (e) => this.handle(e));
  }
}
