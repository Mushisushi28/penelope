/**
 * Penelope v0.2 — Head Agent runtime
 *
 * PenelopeHeadAgent is the single entry point for all inbound owner messages.
 * It:
 *   1. Validates the sender is an allowed owner chat_id (security gate)
 *   2. Routes slash commands to the command dispatcher
 *   3. Falls back to LLM-based intent handling for natural-language messages
 *   4. Sends replies back through the channel adapter
 *
 * v0.2 scope: closed reply loop with command stubs + LLM fallback.
 * v0.3 scope: live specialist invocations.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '@penelope/adapters';
import type { TenantConfig } from '../tenant/schema.js';
import { route, classifyIntent } from './meta-router.js';
import { dispatchCommand, type CommandContext } from './commands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMProvider {
  /** Generate a reply to the owner message. Returns the assistant text. */
  complete(systemPrompt: string, userText: string, maxTokens?: number): Promise<string>;
}

export interface MemoryStore {
  /** Increment the rolling 24h message count for the given tenant+chat. */
  incrementOwnerMessageCount(tenantId: string, chatId: string): Promise<void>;
  /** Return count of owner messages to this tenant in the last 24h. */
  getOwnerMessageCount24h(tenantId: string, chatId: string): Promise<number>;
}

export interface ProcedureLibrary {
  /** Stub — v0.3 will populate. */
  get(topic: string): unknown;
}

export interface PenelopeHeadAgentOptions {
  tenantId: string;
  tenantConfig: TenantConfig;
  channel: ChannelAdapter;
  llm: LLMProvider;
  memory: MemoryStore;
  metaRouter?: typeof route;
  procedures?: ProcedureLibrary;
  /** Pluggable logger. Defaults to console. */
  logger?: { info(msg: string): void; error(msg: string): void; warn(msg: string): void };
}

// ---------------------------------------------------------------------------
// Default LLM provider (Anthropic Claude)
// ---------------------------------------------------------------------------

/**
 * Build the default Anthropic-backed LLM provider.
 * Reads ANTHROPIC_API_KEY from env. Logs a clear error if missing.
 */
export function buildAnthropicLLMProvider(
  tenantConfig: TenantConfig,
  logger?: { info(msg: string): void; error(msg: string): void; warn(msg: string): void },
): LLMProvider {
  const log = logger ?? {
    info: (m: string) => console.info(m),
    error: (m: string) => console.error(m),
    warn: (m: string) => console.warn(m),
  };

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    log.error(
      '[PenelopeHeadAgent] ANTHROPIC_API_KEY is not set. ' +
        'LLM replies will be disabled — commands still work. ' +
        'Add the key to your tenant .env file to enable natural-language replies.',
    );
  }

  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const cfg = tenantConfig;
  const enabledChannels = cfg.channels.filter(c => c.enabled).map(c => c.type).join(', ');
  const specialists = cfg.agents.specialists.filter(s => s.enabled).map(s => s.role).join(', ');

  return {
    async complete(systemPrompt: string, userText: string, maxTokens = 500): Promise<string> {
      if (!client) {
        return (
          "sorry, i can't reply to that right now — anthropic api key not configured. " +
          'try /status or /help for what\'s available.'
        );
      }

      const fullSystem = systemPrompt
        .replace('{tenant_id}', cfg.tenant_id)
        .replace('{owner_name}', cfg.brand?.display_name ?? cfg.name)
        .replace('{channels}', enabledChannels)
        .replace('{specialists}', specialists);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: fullSystem,
        messages: [{ role: 'user', content: userText }],
      });

      const block = message.content[0];
      if (!block || block.type !== 'text') {
        return "sorry, i didn't get a valid reply from the llm. try again.";
      }
      return block.text.trim();
    },
  };
}

// ---------------------------------------------------------------------------
// Default in-memory store (good enough for v0.2)
// ---------------------------------------------------------------------------

export function buildInMemoryStore(): MemoryStore {
  // Map of `${tenantId}:${chatId}` → sorted list of timestamps (ms)
  const buckets = new Map<string, number[]>();
  const WINDOW_MS = 24 * 60 * 60 * 1000;

  function key(tenantId: string, chatId: string): string {
    return `${tenantId}:${chatId}`;
  }

  return {
    async incrementOwnerMessageCount(tenantId, chatId): Promise<void> {
      const k = key(tenantId, chatId);
      const now = Date.now();
      const arr = buckets.get(k) ?? [];
      arr.push(now);
      // Prune older than 24h
      const cutoff = now - WINDOW_MS;
      const fresh = arr.filter(t => t > cutoff);
      buckets.set(k, fresh);
    },
    async getOwnerMessageCount24h(tenantId, chatId): Promise<number> {
      const k = key(tenantId, chatId);
      const now = Date.now();
      const cutoff = now - WINDOW_MS;
      const arr = buckets.get(k) ?? [];
      return arr.filter(t => t > cutoff).length;
    },
  };
}

// ---------------------------------------------------------------------------
// System prompt template
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Penelope, the head agent for a small business owned by {owner_name}.
Reply in 1-3 sentences, lowercase, conversational, no markdown.
If the owner asks for a status, summarize: tenant={tenant_id}, channels={channels}, specialists={specialists}.
If they ask you to do something that requires a specialist not yet wired, say 'v0.3 — coming soon' and explain what's stub vs shipped.
Tonight you're a thin shell; the real specialists wire up next.
Keep it short and human. No emojis.`;

// ---------------------------------------------------------------------------
// Head agent
// ---------------------------------------------------------------------------

export class PenelopeHeadAgent {
  private readonly tenantId: string;
  private readonly tenantConfig: TenantConfig;
  private readonly channel: ChannelAdapter;
  private readonly llm: LLMProvider;
  private readonly memory: MemoryStore;
  private readonly metaRouter: typeof route;
  private readonly log: NonNullable<PenelopeHeadAgentOptions['logger']>;

  constructor(opts: PenelopeHeadAgentOptions) {
    this.tenantId = opts.tenantId;
    this.tenantConfig = opts.tenantConfig;
    this.channel = opts.channel;
    this.llm = opts.llm;
    this.memory = opts.memory;
    this.metaRouter = opts.metaRouter ?? route;
    this.log = opts.logger ?? {
      info: (m) => console.info(`[PenelopeHeadAgent:${opts.tenantId}] ${m}`),
      error: (m) => console.error(`[PenelopeHeadAgent:${opts.tenantId}] ${m}`),
      warn: (m) => console.warn(`[PenelopeHeadAgent:${opts.tenantId}] ${m}`),
    };

    this.log.info(`PenelopeHeadAgent constructed for tenant=${this.tenantId}`);
  }

  /**
   * Handle a single inbound message from the owner channel.
   * Security gate: drop silently if sender is not an allowed owner chat_id.
   */
  async handleInbound(msg: InboundMessage): Promise<void> {
    const allowedIds = this.getAllowedOwnerChatIds();

    // Security gate
    if (!allowedIds.has(msg.external_user_id)) {
      this.log.warn(
        `dropped inbound from non-owner chat_id=${msg.external_user_id} — not in allowlist`,
      );
      return;
    }

    this.log.info(
      `inbound from owner chat_id=${msg.external_user_id}: "${msg.text.slice(0, 80)}"`,
    );

    // Track owner activity
    try {
      await this.memory.incrementOwnerMessageCount(this.tenantId, msg.external_user_id);
    } catch (err) {
      this.log.error(`memory.incrementOwnerMessageCount failed: ${(err as Error).message}`);
    }

    let replyText: string;

    try {
      replyText = await this.computeReply(msg);
    } catch (err) {
      this.log.error(`computeReply threw: ${(err as Error).message}`);
      replyText = "sorry, something went wrong on my end. try again in a moment.";
    }

    // Send the reply
    const outbound: OutboundMessage = {
      tenant_id: this.tenantId,
      channel: msg.channel,
      external_thread_id: msg.external_thread_id,
      text: replyText,
      reply_to_external_id: String((msg.raw as Record<string, unknown> | undefined)?.['message_id'] ?? ''),
    };

    try {
      await this.channel.send(outbound);
      this.log.info(`replied to chat_id=${msg.external_thread_id}: "${replyText.slice(0, 80)}"`);
    } catch (err) {
      this.log.error(`channel.send failed: ${(err as Error).message}`);
    }
  }

  /**
   * Start the channel adapter's subscribe loop and route each inbound
   * through handleInbound. Resolves when the adapter is started.
   */
  async run(): Promise<void> {
    this.log.info(`starting channel adapter (${this.channel.name})`);
    await this.channel.start((msg) => this.handleInbound(msg));
    this.log.info(`polling started for tenant=${this.tenantId}`);
  }

  /**
   * Stop the channel adapter cleanly.
   */
  async stop(): Promise<void> {
    this.log.info('stopping channel adapter');
    await this.channel.stop();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private getAllowedOwnerChatIds(): Set<string> {
    // Derive from tenant config: pull owner_chat_id_env, resolve from env
    const cfg = this.tenantConfig.agents.penelope.telegram_owner;
    const chatIdEnvVar = cfg.owner_chat_id_env;
    const resolved = process.env[chatIdEnvVar];
    if (resolved) {
      return new Set([resolved]);
    }
    // Fallback: if env var not found but looks like a raw value, use as-is
    // (supports inline values in config for testing)
    if (chatIdEnvVar && !chatIdEnvVar.includes('_ENV')) {
      return new Set([chatIdEnvVar]);
    }
    this.log.warn(
      `owner_chat_id_env="${chatIdEnvVar}" not found in process.env — allowlist is empty`,
    );
    return new Set<string>();
  }

  private async computeReply(msg: InboundMessage): Promise<string> {
    const text = msg.text.trim();

    // 1. Command dispatch
    if (text.startsWith('/')) {
      let ownerMessageCount24h = 0;
      try {
        ownerMessageCount24h = await this.memory.getOwnerMessageCount24h(
          this.tenantId,
          msg.external_user_id,
        );
      } catch { /* best effort */ }

      const ctx: CommandContext = {
        tenantConfig: this.tenantConfig,
        chat_id: msg.external_user_id,
        received_at: msg.received_at,
        ownerMessageCount24h,
      };

      const result = dispatchCommand(text, ctx);
      if (result) {
        this.log.info(`command "${text.split(' ')[0]}" dispatched`);
        return result.text;
      }
    }

    // 2. Meta-router intent detection (log only for v0.2; no live specialist dispatch)
    try {
      const dispatch = this.metaRouter({
        text,
        chat_id: msg.external_user_id,
        message_id: String((msg.raw as Record<string, unknown> | undefined)?.['message_id'] ?? msg.id),
        tenant_id: this.tenantId,
      });
      const intent = classifyIntent(text);
      this.log.info(`intent="${intent}" → topic="${dispatch.topic}" (v0.2: LLM fallback, no specialist dispatch)`);
    } catch (err) {
      this.log.warn(`meta-router failed: ${(err as Error).message}`);
    }

    // 3. LLM fallback
    return this.llm.complete(SYSTEM_PROMPT, text, 500);
  }
}
