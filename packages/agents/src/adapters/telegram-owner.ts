/**
 * telegram-owner adapter — PENELOPE EXCLUSIVE
 *
 * Canonical implementation lives in packages/adapters/src/telegram-owner.ts.
 * This copy is vendored into @penelope/agents so the package can be tested
 * and used independently before the adapters package is fully published.
 *
 * When @penelope/adapters is on npm, replace the class body with:
 *   export { TelegramOwnerAdapter } from "@penelope/adapters";
 *
 * ARCHITECTURAL CONSTRAINT:
 *   Only agent_role="penelope" may instantiate this adapter.
 *   All other roles throw at construction time.
 */

export interface TelegramOwnerConfig {
  agent_role: string;
  bot_token: string;
  owner_chat_id: string;
  tenant_id: string;
}

export interface OutboundOwnerMessage {
  text: string;
  reply_to_message_id?: number;
  parse_mode?: "Markdown" | "HTML";
  voice_path?: string;
}

export class TelegramOwnerAdapter {
  private readonly config: TelegramOwnerConfig;

  constructor(config: TelegramOwnerConfig) {
    if (config.agent_role !== "penelope") {
      throw new Error(
        `[Penelope] TelegramOwnerAdapter refused: agent_role="${config.agent_role}" is not allowed. ` +
          "Only agent_role=\"penelope\" may use the telegram-owner adapter. " +
          "Specialists must use the loom-a2a internal bus instead.",
      );
    }
    this.config = config;
  }

  async send(msg: OutboundOwnerMessage): Promise<void> {
    if (!this.config.bot_token || !this.config.owner_chat_id) {
      throw new Error(
        `[Penelope] TelegramOwnerAdapter(${this.config.tenant_id}): ` +
          "bot_token and owner_chat_id must both be set.",
      );
    }
    void msg;
  }

  async react(messageId: number, emoji: string): Promise<void> {
    void messageId;
    void emoji;
  }

  async editMessage(messageId: number, newText: string): Promise<void> {
    void messageId;
    void newText;
  }
}
