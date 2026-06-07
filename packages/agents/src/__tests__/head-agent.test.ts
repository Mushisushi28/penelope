/**
 * PenelopeHeadAgent unit tests — v0.2
 *
 * All LLM calls are mocked. Channel adapter is a stub.
 * No real API keys or network calls required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '@penelope/adapters';
import type { TenantConfig } from '../tenant/schema.js';
import {
  PenelopeHeadAgent,
  buildInMemoryStore,
  type LLMProvider,
  type MemoryStore,
  type PenelopeHeadAgentOptions,
} from '../penelope/head-agent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTenantConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    schema_version: 1,
    tenant_id: 'dhr',
    name: 'Dobson Headlight Restoration',
    vertical: 'auto-service',
    brand: {
      display_name: 'DHR',
      brand_color: '#2563EB',
    },
    hours: {
      timezone: 'America/Edmonton',
      schedule: {},
    },
    channels: [
      {
        type: 'telegram-owner',
        enabled: true,
        credential_env: 'TELEGRAM_BOT_TOKEN',
      },
    ],
    agents: {
      penelope: {
        role: 'penelope',
        telegram_owner: {
          bot_token_env: 'TELEGRAM_BOT_TOKEN',
          owner_chat_id_env: 'OWNER_CHAT_ID',
        },
      },
      specialists: [
        { role: 'follow-up', enabled: true },
        { role: 'marketing', enabled: true },
      ],
    },
    ...overrides,
  } as unknown as TenantConfig;
}

/** Minimal ChannelAdapter stub — captures sends. */
function makeStubAdapter(): ChannelAdapter & { sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    name: 'telegram',
    channel_id: 'telegram',
    capabilities: {
      send_text: true,
      send_attachments: false,
      reactions: false,
      thread_history: false,
      polling_inbox: true,
      webhook_inbox: false,
      supports_typing_indicator: false,
    },
    sent,
    async start() {},
    async stop() {},
    async send(out) {
      sent.push(out);
      return { external_id: 'stub-msg-id' };
    },
    async healthCheck() { return { ok: true }; },
  };
}

function makeMockLLM(reply = 'mock llm reply'): LLMProvider {
  return {
    complete: vi.fn(async () => reply),
  };
}

function makeInboundMsg(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: '42',
    channel: 'telegram',
    tenant_id: 'dhr',
    external_thread_id: '7949309437',
    external_user_id: '7949309437',
    text: 'hello',
    received_at: new Date().toISOString(),
    raw: { message_id: 100 },
    ...overrides,
  };
}

function makeAgent(opts: Partial<PenelopeHeadAgentOptions> = {}): {
  agent: PenelopeHeadAgent;
  adapter: ReturnType<typeof makeStubAdapter>;
  llm: LLMProvider;
  memory: MemoryStore;
} {
  const adapter = opts.channel as ReturnType<typeof makeStubAdapter> ?? makeStubAdapter();
  const llm = opts.llm ?? makeMockLLM();
  const memory = opts.memory ?? buildInMemoryStore();
  const tenantConfig = opts.tenantConfig ?? makeTenantConfig();

  // Set env var so the allowlist resolves
  process.env['OWNER_CHAT_ID'] = '7949309437';

  const agent = new PenelopeHeadAgent({
    tenantId: 'dhr',
    tenantConfig,
    channel: adapter,
    llm,
    memory,
    ...opts,
  });

  return { agent, adapter: adapter as ReturnType<typeof makeStubAdapter>, llm, memory };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PenelopeHeadAgent', () => {
  beforeEach(() => {
    process.env['OWNER_CHAT_ID'] = '7949309437';
  });

  it('/start returns the welcome message', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/start' }));

    expect(adapter.sent).toHaveLength(1);
    const reply = adapter.sent[0]!.text;
    expect(reply).toContain("i'm penelope");
    expect(reply).toContain('/status');
    expect(reply).toContain('/help');
  });

  it('/status returns tenant name and channel info', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/status' }));

    expect(adapter.sent).toHaveLength(1);
    const reply = adapter.sent[0]!.text;
    expect(reply).toContain('dhr');
    expect(reply).toContain('telegram-owner');
  });

  it('/help lists available commands', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/help' }));

    expect(adapter.sent).toHaveLength(1);
    const reply = adapter.sent[0]!.text;
    expect(reply).toContain('/start');
    expect(reply).toContain('/status');
    expect(reply).toContain('/inbox');
    expect(reply).toContain('/quote');
  });

  it('/quote returns v0.3 placeholder', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/quote' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('v0.3');
  });

  it('/followup returns v0.3 placeholder', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/followup' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('v0.3');
  });

  it('/book returns v0.3 placeholder', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/book' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('v0.3');
  });

  it('/review returns v0.3 placeholder', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/review' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('v0.3');
  });

  it('/inbox returns connector stub message', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/inbox' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('v0.3');
  });

  it('natural language message triggers LLM and returns reply', async () => {
    const llm = makeMockLLM('hey there, how can i help?');
    const { agent, adapter } = makeAgent({ llm });

    await agent.handleInbound(makeInboundMsg({ text: 'how are you doing?' }));

    expect(llm.complete).toHaveBeenCalledOnce();
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toBe('hey there, how can i help?');
  });

  it('message from non-owner chat_id is silently ignored', async () => {
    const { agent, adapter } = makeAgent();

    await agent.handleInbound(
      makeInboundMsg({ external_user_id: '9999999999', external_thread_id: '9999999999' }),
    );

    expect(adapter.sent).toHaveLength(0);
  });

  it('reply is threaded to inbound message_id', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/start', raw: { message_id: 42 } }));

    expect(adapter.sent[0]!.reply_to_external_id).toBe('42');
  });

  it('unknown command returns helpful fallback', async () => {
    const { agent, adapter } = makeAgent();
    await agent.handleInbound(makeInboundMsg({ text: '/nonexistent' }));

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]!.text).toContain('/nonexistent');
    expect(adapter.sent[0]!.text).toContain('/help');
  });
});
