/**
 * meta-router.ts
 *
 * Pattern-matches owner natural-language input → typed dispatch envelopes
 * posted on the per-tenant a2a bus.
 */

import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export const DispatchEnvelopeSchema = z.object({
  /** Unique ID for this dispatch (callers should generate a UUID) */
  id: z.string(),
  /** ISO timestamp of dispatch */
  at: z.string(),
  /** Tenant slug this dispatch belongs to */
  tenantId: z.string(),
  /** The specialist to invoke */
  specialist: z.string(),
  /** Sub-action within the specialist (optional) */
  action: z.string().optional(),
  /** Named capture groups extracted from the owner's input */
  args: z.record(z.string()).default({}),
  /** Raw owner message for specialist context */
  rawInput: z.string(),
  /** Owner's Telegram message ID for confirmation threading */
  ownerMessageId: z.string().optional(),
});

export type DispatchEnvelope = z.infer<typeof DispatchEnvelopeSchema>;

export interface IntentDefinition {
  /** Human-readable name */
  name: string;
  /** Pattern(s) to test against the owner message */
  patterns: RegExp[];
  /** Specialist to invoke */
  specialist: string;
  /** Optional sub-action */
  action?: string;
  /** Map pattern capture groups → args keys */
  captureMap?: Record<string, string>;
}

export interface RouteResult {
  matched: true;
  intent: IntentDefinition;
  args: Record<string, string>;
  envelope: Omit<DispatchEnvelope, "id" | "at">;
}

export interface NoRouteResult {
  matched: false;
  fallback: "owner-agent-self";
}

export type MatchResult = RouteResult | NoRouteResult;

// ─── Intent Registry ──────────────────────────────────────────────────────────

export const INTENTS: IntentDefinition[] = [
  // Daily brief
  {
    name: "daily-brief",
    patterns: [
      /what['']?s?\s+today/i,
      /morning\s+brief/i,
      /daily\s+brief/i,
      /morning\s+summary/i,
      /what['']?s?\s+on\s+my\s+plate/i,
      /catch\s+me\s+up/i,
      /summary/i,
      /how['']?s?\s+it\s+look/i,
    ],
    specialist: "daily-brief",
  },

  // Review ask — must come BEFORE customer-send (more specific "send review ask" pattern)
  {
    name: "review-ask",
    patterns: [
      /send\s+review\s+(?:ask|request)\s+to\s+(\w+)/i,
      /ask\s+(\w+)\s+for\s+(?:a\s+)?review/i,
      /review\s+ask\s+(\w+)/i,
    ],
    specialist: "review-ask",
    captureMap: { "1": "customer" },
  },

  // Send customer something
  {
    name: "customer-send",
    patterns: [/send\s+(\w+)\s+the\s+(.+)/i, /send\s+(\w+)\s+(.+)/i],
    specialist: "customer-frontend",
    action: "send",
    captureMap: { "1": "customer", "2": "what" },
  },

  // Draft a quote
  {
    name: "quote-builder",
    patterns: [
      /draft\s+(?:a\s+)?quote\s+for\s+(.+)/i,
      /quote\s+(?:for\s+)?(.+)/i,
      /price\s+(?:out\s+)?(.+)/i,
      /how\s+much\s+(?:for\s+)?(.+)/i,
    ],
    specialist: "quote-builder",
    captureMap: { "1": "jobDescription" },
  },

  // Pause autopilot
  {
    name: "autopilot-pause",
    patterns: [/pause\s+autopilot/i, /turn\s+off\s+autopilot/i, /stop\s+autopilot/i, /disable\s+autopilot/i],
    specialist: "tenant-state",
    action: "pause",
  },

  // Resume autopilot
  {
    name: "autopilot-resume",
    patterns: [/resume\s+autopilot/i, /turn\s+on\s+autopilot/i, /start\s+autopilot/i, /enable\s+autopilot/i],
    specialist: "tenant-state",
    action: "resume",
  },

  // New inbound / inbox check
  {
    name: "inbox-check",
    patterns: [
      /who\s+(?:just\s+)?texted/i,
      /new\s+(?:message|msg|dm)/i,
      /(?:check\s+)?inbox/i,
      /any\s+new\s+(?:messages|msgs)/i,
      /what\s+(?:came\s+in|arrived)/i,
    ],
    specialist: "customer-frontend",
    action: "inbox",
  },

  // Book a customer
  {
    name: "booking",
    patterns: [
      /book\s+(\w+)\s+(?:for\s+)?(.+)/i,
      /schedule\s+(\w+)\s+(?:for\s+)?(.+)/i,
      /(?:add|put)\s+(\w+)\s+on\s+(?:the\s+)?calendar(?:\s+for\s+(.+))?/i,
    ],
    specialist: "booking",
    captureMap: { "1": "customer", "2": "when" },
  },

  // Marketing content draft
  {
    name: "marketing-draft",
    patterns: [
      /draft\s+(?:a\s+)?(?:post|reel|email|ad|content)\s*(?:for\s+)?(.+)?/i,
      /create\s+(?:a\s+)?(?:post|reel|email|ad)\s*(?:for\s+)?(.+)?/i,
      /write\s+(?:a\s+)?(?:post|reel|email|ad)\s*(?:for\s+)?(.+)?/i,
      /marketing/i,
    ],
    specialist: "marketing",
    action: "draft",
    captureMap: { "1": "topic" },
  },

  // Payment reconciliation
  {
    name: "payment-reconcile",
    patterns: [
      /what['']?s?\s+owed/i,
      /reconcile/i,
      /outstanding\s+(?:invoices|payments)/i,
      /who\s+(?:hasn['']?t\s+paid|owes)/i,
      /payment\s+status/i,
    ],
    specialist: "payment-reconciler",
  },

  // Customer lookup
  {
    name: "customer-lookup",
    patterns: [
      /(?:look\s+up|find|show\s+me)\s+(?:customer\s+)?(\w+)/i,
      /what['']?s?\s+(?:the\s+)?status\s+(?:on\s+|for\s+)?(\w+)/i,
      /(\w+)['']?s?\s+(?:thread|history|messages)/i,
    ],
    specialist: "customer-frontend",
    action: "lookup",
    captureMap: { "1": "customer" },
  },
];

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Extract named capture groups from a regex match using a captureMap.
 * captureMap maps positional group index (as string) to an arg key name.
 */
function extractArgs(
  match: RegExpMatchArray,
  captureMap?: Record<string, string>
): Record<string, string> {
  if (!captureMap) return {};
  const args: Record<string, string> = {};
  for (const [idx, key] of Object.entries(captureMap)) {
    const value = match[Number(idx)];
    if (value !== undefined) {
      args[key] = value.trim();
    }
  }
  return args;
}

/**
 * Route an owner message to the best matching specialist dispatch.
 * Returns NoRouteResult if no intent matches — caller should handle with
 * owner-agent self-answer.
 */
export function route(
  input: string,
  tenantId: string,
  ownerMessageId?: string
): MatchResult {
  const trimmed = input.trim();

  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const args = extractArgs(match, intent.captureMap);
        return {
          matched: true,
          intent,
          args,
          envelope: {
            tenantId,
            specialist: intent.specialist,
            action: intent.action,
            args,
            rawInput: trimmed,
            ownerMessageId,
          },
        };
      }
    }
  }

  return { matched: false, fallback: "owner-agent-self" };
}

/**
 * Stamp a RouteResult with id + at to produce a full DispatchEnvelope.
 */
export function buildEnvelope(
  result: RouteResult,
  id: string
): DispatchEnvelope {
  return DispatchEnvelopeSchema.parse({
    id,
    at: new Date().toISOString(),
    ...result.envelope,
  });
}

// ─── Bus post stub ────────────────────────────────────────────────────────────

/**
 * Post a dispatch envelope to the per-tenant a2a bus.
 * Real implementation plugs into the loom bus.sqlite writer;
 * this stub logs and resolves for testing.
 */
export async function postToBus(
  envelope: DispatchEnvelope
): Promise<{ queued: boolean; envelopeId: string }> {
  // TODO: replace with real bus.sqlite insert via loom-a2a
  console.log("[meta-router] dispatching", JSON.stringify(envelope, null, 2));
  return { queued: true, envelopeId: envelope.id };
}
