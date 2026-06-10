/**
 * Penelope v0.2 — Command handlers
 *
 * Every handler receives the parsed command name + args, plus context about
 * the current tenant configuration, and returns an OutboundMessage text.
 *
 * Commands are read-only / placeholder in v0.2 — no write actions, no
 * owner-confirm gate needed yet. Those arrive in v0.3 with live specialist
 * invocations.
 */

import type { TenantConfig } from '../tenant/schema.js';

export interface CommandContext {
  tenantConfig: TenantConfig;
  chat_id: string;
  /** ISO timestamp when the message was received. */
  received_at: string;
  /** Count of owner messages in the past 24h (pass 0 when unknown). */
  ownerMessageCount24h?: number;
}

export interface CommandResult {
  text: string;
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------

export function handleStart(_args: string, _ctx: CommandContext): CommandResult {
  return {
    text: [
      "hi, i'm penelope. i'll run the digital side of your business through this chat.",
      "try /status to see today's activity, or just tell me what you need.",
      "type /help to see everything i can do right now.",
    ].join(' '),
  };
}

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------

export function handleStatus(_args: string, ctx: CommandContext): CommandResult {
  const cfg = ctx.tenantConfig;
  const enabledChannels = cfg.channels
    .filter(c => c.enabled)
    .map(c => c.type)
    .join(', ') || 'none';

  const specialists = cfg.agents.specialists
    .filter(s => s.enabled)
    .map(s => s.role)
    .join(', ') || 'none configured';

  const msgCount = ctx.ownerMessageCount24h ?? 0;
  const msgLine = msgCount > 0
    ? `owner messages (24h): ${msgCount}`
    : 'no owner messages in last 24h';

  return {
    text: [
      `tenant: ${cfg.tenant_id} (${cfg.name})`,
      `channels: ${enabledChannels}`,
      `specialists: ${specialists}`,
      msgLine,
      'customer connectors not yet wired for live ops — v0.3.',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

export function handleHelp(_args: string, _ctx: CommandContext): CommandResult {
  const lines = [
    '/start — re-introduce me and show quick-start tips',
    '/status — tenant name, channels, specialists, last 24h activity',
    '/help — this list',
    '/inbox — customer activity surface (v0.3 — stub for now)',
    '/quote — draft a quote for a customer (v0.3)',
    '/followup — draft follow-up messages for dormant leads (v0.3)',
    '/book — check/manage bookings (v0.3)',
    '/review — send a review-ask to a recent customer (v0.3)',
    '',
    'or just type naturally and i\'ll do my best to figure out what you need.',
  ];
  return { text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// /inbox
// ---------------------------------------------------------------------------

export function handleInbox(_args: string, _ctx: CommandContext): CommandResult {
  return {
    text: 'no customer activity to surface — connectors not yet wired for live customer ops. (v0.3)',
  };
}

// ---------------------------------------------------------------------------
// Placeholder commands — all return v0.3 stub message
// ---------------------------------------------------------------------------

const V03_PLACEHOLDER =
  'v0.3 — coming soon. for now i can /status and acknowledge your messages. specialists wire up next.';

export function handleQuote(_args: string, _ctx: CommandContext): CommandResult {
  return { text: V03_PLACEHOLDER };
}

export function handleFollowup(_args: string, _ctx: CommandContext): CommandResult {
  return { text: V03_PLACEHOLDER };
}

export function handleBook(_args: string, _ctx: CommandContext): CommandResult {
  return { text: V03_PLACEHOLDER };
}

export function handleReview(_args: string, _ctx: CommandContext): CommandResult {
  return { text: V03_PLACEHOLDER };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export type CommandName =
  | 'start'
  | 'status'
  | 'help'
  | 'inbox'
  | 'quote'
  | 'followup'
  | 'book'
  | 'review';

const HANDLERS: Record<
  CommandName,
  (args: string, ctx: CommandContext) => CommandResult
> = {
  start: handleStart,
  status: handleStatus,
  help: handleHelp,
  inbox: handleInbox,
  quote: handleQuote,
  followup: handleFollowup,
  book: handleBook,
  review: handleReview,
};

/**
 * Parse a command string and dispatch to the correct handler.
 * Returns null if the text is not a recognised command (caller should
 * fall through to LLM intent handling).
 */
export function dispatchCommand(
  text: string,
  ctx: CommandContext,
): CommandResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  // Extract command name (strip leading slash, split on space/newline)
  const raw = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? '';
  // Strip bot username suffix e.g. /start@penelopeops_bot
  const name = raw.split('@')[0] ?? '';
  const args = trimmed.slice(name.length + 1).trim();

  const handler = HANDLERS[name as CommandName];
  if (!handler) {
    return {
      text: `unknown command /${name}. type /help to see what i can do.`,
    };
  }

  return handler(args, ctx);
}
