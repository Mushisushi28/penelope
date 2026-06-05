/**
 * Procedure-as-code types for Penelope.
 *
 * Every customer-facing decision lives in a YAML file, not in a prompt.
 * Specialists load the YAML at spawn; changing pricing or follow-up cadence
 * is a file edit, not a re-prompt.
 *
 * A Procedure defines:
 *   - What inputs are required/optional
 *   - A state machine of named states with triggers + actions + gates
 *   - Runtime budget limits
 *   - Brand voice constraints
 *   - Output contracts
 *
 * Reference: LOOM_BUSINESS_SCOPE_v1.md §6 procedure sketch.
 */

import type { ApprovalLevel, Channel } from '../tenant/types.js';

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

/** All recognized step kinds. Unknown kinds cause a validation error. */
export type StepKind =
  | 'send_message'         // Send a reply on a channel
  | 'ask_question'         // Ask the customer a qualifying question
  | 'compute_quote'        // Run the pricing engine
  | 'lookup_external'      // Call an external API (Amazon, Google, etc.)
  | 'set_state'            // Update customer/thread state
  | 'schedule_followup'    // Schedule a deferred action
  | 'emit_bus_event'       // Emit an event on the Loom bus
  | 'escalate'             // Hand off to a higher-level agent
  | 'wait_for_event'       // Pause until a bus event arrives
  | 'offer_booking_link'   // Send Calendly/gCal booking link
  | 'mark_job_status'      // Update job status (quoted/booked/paid/closed)
  | 'send_review_request'  // Fire a review-ask SMS or email
  | 'send_invoice'         // Send payment link
  | 'log_audit';           // Write to the audit log

/** Base shape shared by all step kinds. */
export interface BaseStep {
  /** Step kind — determines which fields are valid. */
  kind: StepKind;
  /** Human label for this step (used in logs and dashboard). */
  label?: string;
  /** Approval required before executing this step. */
  approval?: ApprovalLevel;
  /** If true, continue even if this step fails. Default: false. */
  optional?: boolean;
}

/** Send a text message on a channel. */
export interface SendMessageStep extends BaseStep {
  kind: 'send_message';
  /** Template string — use {{variable}} for interpolation. */
  template: string;
  channel?: Channel;
}

/** Ask a qualifying question and wait for reply. */
export interface AskQuestionStep extends BaseStep {
  kind: 'ask_question';
  question: string;
  /** Key to store the answer under in the procedure context. */
  store_as: string;
  channel?: Channel;
}

/** Compute a quote using the tenant's pricing rules. */
export interface ComputeQuoteStep extends BaseStep {
  kind: 'compute_quote';
  /** Which pricing rule id to apply, e.g. "regular" */
  pricing_rule_id: string;
  /** Output context key for the computed quote amount. */
  store_as: string;
  /** If the quote is outside auto_quote_band, use this approval level. */
  out_of_band_approval?: ApprovalLevel;
}

/** Look up information from an external service. */
export interface LookupExternalStep extends BaseStep {
  kind: 'lookup_external';
  service: string;   // e.g. "amazon_product", "google_places", "calendly_slots"
  query_template: string;
  store_as: string;
}

/** Update a key in the thread/customer state. */
export interface SetStateStep extends BaseStep {
  kind: 'set_state';
  key: string;
  value: string | number | boolean;
}

/** Schedule a deferred follow-up action. */
export interface ScheduleFollowupStep extends BaseStep {
  kind: 'schedule_followup';
  /** ISO 8601 duration, e.g. "PT1H" (1 hour), "P1D" (1 day) */
  delay: string;
  /** Procedure id to invoke at the scheduled time. */
  invoke_procedure: string;
  /** Input overrides for the invoked procedure. */
  inputs?: Record<string, string | number | boolean>;
}

/** Emit a Loom bus event. */
export interface EmitBusEventStep extends BaseStep {
  kind: 'emit_bus_event';
  event_type: string;
  payload_template?: Record<string, string | number | boolean>;
}

/** Escalate to a higher-level agent and halt this procedure. */
export interface EscalateStep extends BaseStep {
  kind: 'escalate';
  to: string;         // agent id or role, e.g. "dhr-lead", "owner"
  reason: string;
  /** Whether to include the full thread context in the escalation. */
  include_context?: boolean;
}

/** Pause until a specific bus event arrives. */
export interface WaitForEventStep extends BaseStep {
  kind: 'wait_for_event';
  event_type: string;
  /** Max wait in ISO 8601 duration, e.g. "PT24H" */
  timeout: string;
  /** Procedure to invoke on timeout. */
  on_timeout?: string;
}

/** Offer a booking/scheduling link to the customer. */
export interface OfferBookingLinkStep extends BaseStep {
  kind: 'offer_booking_link';
  provider: 'calendly' | 'gcal' | 'manual';
  /** URL template — can include {{variable}} refs */
  url_template?: string;
  /** Message template wrapping the link */
  message_template?: string;
  channel?: Channel;
}

/** Mark a job's status in the CRM. */
export interface MarkJobStatusStep extends BaseStep {
  kind: 'mark_job_status';
  status: 'new' | 'qualifying' | 'quoted' | 'booked' | 'paid' | 'closed' | 'lost';
}

/** Send a review-ask message after job completion. */
export interface SendReviewRequestStep extends BaseStep {
  kind: 'send_review_request';
  platform: 'google' | 'facebook' | 'yelp' | 'custom';
  /** URL template for review link */
  url_template: string;
  message_template: string;
  channel: Channel;
  /** Delay after trigger event before sending. ISO 8601 duration. */
  delay?: string;
}

/** Send a payment/invoice link to the customer. */
export interface SendInvoiceStep extends BaseStep {
  kind: 'send_invoice';
  processor: 'square' | 'stripe' | 'paypal' | 'manual';
  amount_from_context?: string;  // context key holding the amount
  channel?: Channel;
}

/** Write to the tenant audit log. */
export interface LogAuditStep extends BaseStep {
  kind: 'log_audit';
  event: string;
  detail_template?: string;
}

/** Union of all step types. */
export type ProcedureStep =
  | SendMessageStep
  | AskQuestionStep
  | ComputeQuoteStep
  | LookupExternalStep
  | SetStateStep
  | ScheduleFollowupStep
  | EmitBusEventStep
  | EscalateStep
  | WaitForEventStep
  | OfferBookingLinkStep
  | MarkJobStatusStep
  | SendReviewRequestStep
  | SendInvoiceStep
  | LogAuditStep;

// ---------------------------------------------------------------------------
// State in the procedure state machine
// ---------------------------------------------------------------------------

/** A named state in the procedure state machine. */
export interface ProcedureState {
  /** Unique id for this state, e.g. "new_inbound" */
  id: string;
  /** Human label */
  label?: string;
  /**
   * Conditions that must be true for this state to be entered.
   * If omitted, state is always reachable from transitions.
   */
  when?: string[];
  /** Steps executed when this state is entered. */
  actions: ProcedureStep[];
  /** Id of the next state to transition to on success. */
  next?: string;
  /** Approval required before entering this state. */
  approval?: ApprovalLevel;
}

// ---------------------------------------------------------------------------
// Procedure (top-level)
// ---------------------------------------------------------------------------

/** Runtime budget limits for a single procedure invocation. */
export interface ProcedureBudget {
  /** Max LLM tokens per run. */
  max_tokens_per_run?: number;
  /** Max cost in USD per run (approximate). */
  max_usd_per_run?: number;
  /** Max times this procedure can run per thread per day. */
  max_runs_per_thread_per_day?: number;
}

/** Input definition for a procedure. */
export interface ProcedureInput {
  required: string[];
  optional?: string[];
}

/** Brand voice constraints applied during this procedure. */
export interface ProcedureVoice {
  tone?: string;
  forbidden_phrases?: string[];
  emoji_policy?: 'none' | 'minimal' | 'match-customer';
  signature?: string;
}

/**
 * A Procedure is the top-level type loaded from a YAML file.
 * It is the contract between the platform and a specialist agent.
 */
export interface Procedure {
  /** YAML schema version. Current: 1 */
  schema_version: 1;

  /** Unique procedure id. Should be namespaced: `<tenant>-<name>`. */
  procedure_id: string;

  /** Human-readable description of what this procedure does. */
  description?: string;

  /** Which team owns this procedure. */
  owner_team: string;

  /** The specialist class that runs this procedure. */
  specialist_class: string;

  /** Trigger that activates this procedure. */
  trigger: ProcedureTrigger;

  /** Input schema. */
  inputs: ProcedureInput;

  /** Runtime budget limits. */
  runtime_budget?: ProcedureBudget;

  /** Brand voice constraints. */
  brand_voice?: ProcedureVoice;

  /** State machine definition. At least one state required. */
  states: ProcedureState[];

  /**
   * Output contract — keys that the procedure guarantees to produce.
   * Downstream procedures can rely on these.
   */
  outputs?: string[];

  /** Arbitrary metadata (version, changelog, notes). */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------

export type TriggerKind =
  | 'inbound_message'    // Customer sends a message on any channel
  | 'bus_event'          // A specific Loom bus event fires
  | 'schedule'           // Cron or interval
  | 'payment_received'   // Payment processor webhook
  | 'job_status_change'  // Job status transitions
  | 'manual';            // Invoked manually by an agent

export interface ProcedureTrigger {
  kind: TriggerKind;
  /** Channel filter (for inbound_message triggers). */
  channel?: Channel;
  /** Bus event type (for bus_event triggers). */
  event_type?: string;
  /** Cron expression (for schedule triggers). */
  cron?: string;
  /** Additional filter conditions. */
  conditions?: string[];
}
