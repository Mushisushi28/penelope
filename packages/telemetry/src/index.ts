export { TenantMeter } from "./meter.js";
export type { MetricsSnapshot, CounterRow, UptimeRow } from "./meter.js";

export { TelemetryMiddleware } from "./middleware.js";
export type { BusEvent } from "./middleware.js";

export { buildAnonymousPing, assertNoPii, hashSlug } from "./anonymize.js";
export type { AnonymousPing } from "./anonymize.js";

export { getTenantMetrics, getMultiTenantMetrics } from "./api.js";
export type { MetricsOptions } from "./api.js";

export { maybePing, TELEMETRY_ENDPOINT, PACKAGE_VERSION } from "./opt-in.js";
export type { TenantConfig, PingResult } from "./opt-in.js";
