/**
 * Penelope — Meta-router
 *
 * All inbound messages from the telegram-owner adapter arrive here.
 * Penelope is the ONLY agent that reads from telegram-owner. She parses
 * the owner's intent and dispatches to the appropriate specialist via
 * the internal loom-a2a bus. Specialist results return to Penelope, who
 * decides what (if anything) the owner sees.
 *
 * Org chart:
 *   USER ←─── telegram-owner ───→ PENELOPE (head agent)
 *                                      │
 *             ┌──────────┬─────────────┼────────────┬──────────┬──────────┐
 *             ▼          ▼             ▼            ▼          ▼          ▼
 *         customer   booking       quoting      payments   reviews   marketing
 *         (bus only — never touch telegram-owner)
 */

export interface InboundOwnerMessage {
  text: string;
  voice_path?: string;
  chat_id: string;
  message_id: string;
  tenant_id: string;
}

export interface BusDispatch {
  topic: string;
  payload: Record<string, unknown>;
}

export type Intent =
  | 'customer'
  | 'quote'
  | 'booking'
  | 'payment'
  | 'review'
  | 'marketing'
  | 'followup'
  | 'dormant'
  | 'brief'
  | 'status'
  | 'autopilot'
  | 'content'
  | 'unknown';

/** Maps a parsed intent to the bus topic Penelope publishes on. */
export const INTENT_TOPIC_MAP: Record<Intent, string> = {
  customer: 'customer.dispatch',
  quote: 'quote.requested',
  booking: 'booking.requested',
  payment: 'payment.queried',
  review: 'review.ask.requested',
  marketing: 'marketing.dispatch',
  followup: 'followup.draft.requested',
  dormant: 'followup.dormant.requested',
  brief: 'brief.requested',
  status: 'system.status.requested',
  autopilot: 'system.autopilot.toggle',
  content: 'content.generation.requested',
  unknown: 'penelope.unrecognised',
};

/**
 * Classify the owner's raw text into a structured intent.
 * Production implementation will use an LLM call with the tenant's persona.
 * This stub uses keyword heuristics so the module is testable without API keys.
 */
export function classifyIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\bquote\b|\bquot/.test(t)) return 'quote';
  if (/\bbook(ing)?\b|\bschedul/.test(t)) return 'booking';
  if (/\bpayment\b|\bpaid\b|\breconcil/.test(t)) return 'payment';
  if (/\breview\b|\bask.*review/.test(t)) return 'review';
  if (/\bmarketing\b|\bcampaign\b|\bdraft.*post\b|\bpost.*this week\b|\bwhat should i post\b|\bsocial post\b/.test(t)) return 'marketing';
  if (/\bfollow.?up\b.*\bwith\b|\bdraft.*follow.?up\b|\bfollow.?up.*to\b/.test(t)) return 'followup';
  if (/\bwho.*nudge\b|\bwho.*dormant\b|\bdormant\b|\bnudge\b/.test(t)) return 'dormant';
  if (/\bbrief\b|\btoday\b|\bmorning/.test(t)) return 'brief';
  if (/\bstatus\b/.test(t)) return 'status';
  if (/\bautopilot\b|\bpause\b/.test(t)) return 'autopilot';
  // Content specialist intent recognition
  if (
    /\bmake.*before.?after\b|\bgenerate.*before.?after\b|\bbefore.?after.*photo\b|\bbefore.?after.*image\b/.test(t) ||
    /\bclean up.*photo\b|\bclean.*this.*photo\b|\bremove.*tape.*from\b|\bremove.*watermark\b/.test(t) ||
    /\bsort.*today.*photos\b|\bsort.*photos\b|\bmake.*promo.*image\b|\bgenerate.*promo\b/.test(t)
  ) return 'content';
  if (/\bcustomer\b|\blead\b|\bdm\b|\bmessage\b/.test(t)) return 'customer';
  return 'unknown';
}

/**
 * Route an inbound owner message to the correct bus topic.
 * Returns the dispatch envelope; the caller publishes it to the bus.
 */
export function route(msg: InboundOwnerMessage): BusDispatch {
  const intent = classifyIntent(msg.text);
  const t = msg.text.toLowerCase();

  // For content intent, resolve a more specific sub-topic based on phrasing.
  let topic = INTENT_TOPIC_MAP[intent];
  if (intent === 'content') {
    if (/\bremove.*watermark\b|\bwatermark\b/.test(t)) {
      topic = 'content.cleanup.requested';
    } else if (/\bsort.*photos\b|\bsort.*today\b/.test(t)) {
      topic = 'content.sort.requested';
    } else if (/\bremove.*tape\b|\bremove.*tool\b|\bclean.*photo\b/.test(t)) {
      topic = 'content.cleanup.requested';
    }
    // Default: content.generation.requested (before/after, promo)
  }

  return {
    topic,
    payload: {
      source: 'penelope',
      tenant_id: msg.tenant_id,
      chat_id: msg.chat_id,
      message_id: msg.message_id,
      raw_text: msg.text,
      intent,
    },
  };
}
