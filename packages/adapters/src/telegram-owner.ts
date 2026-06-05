/**
 * telegram-owner adapter — PENELOPE EXCLUSIVE
 *
 * This adapter is the sole Telegram channel between the owner and the system.
 * It is reserved for Penelope (head agent) only.
 *
 * ARCHITECTURAL CONSTRAINT (hard rule, enforced at runtime):
 *   Only an agent whose config carries `agent_role: "penelope"` may
 *   instantiate this adapter. Any other role receives a hard error at
 *   construction time — never at message-send time, so misconfiguration
 *   is caught at startup, not mid-conversation.
 *
 * All other agents (customer-frontend, booking, quoting, payment-reconciler,
 * review-ask, marketing, daily-brief) must use the loom-a2a internal bus.
 * They publish results to the bus; Penelope subscribes and decides what
 * (if anything) the owner sees.
 *
 * Org chart:
 *
 *   USER  ←─────── telegram-owner ───────→  PENELOPE  (head agent)
 *                                                │
 *             ┌──────┬──────┬─────────┬─────────┼──────┬─────────┐
 *             ▼      ▼      ▼         ▼          ▼      ▼         ▼
 *         customer booking quoting payments   reviews marketing daily-brief
 *         (bus only — never touch telegram-owner)
 */

export interface TelegramOwnerConfig {
  /** The role of the agent requesting this adapter. Must be "penelope". */
  agent_role: string;
  /** Telegram bot token (from BotFather). */
  bot_token: string;
  /** The owner's Telegram chat ID. */
  owner_chat_id: string;
  tenant_id: string;
}

export interface OutboundOwnerMessage {
  text: string;
  reply_to_message_id?: number;
  parse_mode?: 'Markdown' | 'HTML';
  voice_path?: string;
}

export class TelegramOwnerAdapter {
  private readonly config: TelegramOwnerConfig;

  constructor(config: TelegramOwnerConfig) {
    // Hard guard: only Penelope may use this adapter.
    if (config.agent_role !== 'penelope') {
      throw new Error(
        `[Penelope] TelegramOwnerAdapter refused: agent_role="${config.agent_role}" is not allowed. ` +
          'Only agent_role="penelope" may use the telegram-owner adapter. ' +
          'Specialists must use the loom-a2a internal bus instead.',
      );
    }

    this.config = config;
  }

  /** Send a text message to the owner. */
  async send(msg: OutboundOwnerMessage): Promise<void> {
    // Production: call Telegram Bot API sendMessage / sendVoice.
    // Stub implementation validates config is wired correctly.
    if (!this.config.bot_token || !this.config.owner_chat_id) {
      throw new Error(
        `[Penelope] TelegramOwnerAdapter(${this.config.tenant_id}): ` +
          'bot_token and owner_chat_id must both be set.',
      );
    }
    // Real implementation would call:
    //   POST https://api.telegram.org/bot{token}/sendMessage
    //   { chat_id, text, reply_to_message_id, parse_mode }
    void msg; // suppress unused-var in stub
  }

  /** React to an owner message. */
  async react(messageId: number, emoji: string): Promise<void> {
    void messageId;
    void emoji;
  }

  /** Edit a previously sent message (progress updates, no push notification). */
  async editMessage(messageId: number, newText: string): Promise<void> {
    void messageId;
    void newText;
  }
}
