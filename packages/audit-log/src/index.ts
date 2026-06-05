export { AuditLog, computeEntryHash } from "./append-only.js";
export type { AuditEntry, AuditEntryInput } from "./append-only.js";

export { verifyEntries } from "./verify.js";
export type { VerificationResult, VerificationError } from "./verify.js";

export { queryOutbound, outboundSummaryByRecipient, auditTrailForCustomer } from "./query.js";
export type { QueryOptions, QueryResult } from "./query.js";
