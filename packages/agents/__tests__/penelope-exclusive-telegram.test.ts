/**
 * Tests: Penelope is the only agent allowed to acquire the telegram-owner adapter.
 *
 * Guards are enforced at:
 *   1. TelegramOwnerAdapter constructor (adapter layer)
 *   2. SpecialistAgent.acquireTelegramOwnerAdapter() (agent layer)
 *   3. validateAgentConfig() in tenant schema (config layer)
 */

import { describe, it, expect } from "vitest";
import { TelegramOwnerAdapter } from "../src/adapters/telegram-owner.js";
import { SpecialistAgent, type SpecialistConfig } from "../src/specialists/base.js";
import { validateAgentConfig } from "../src/tenant/schema.js";
import type { TenantConfig } from "../src/tenant/schema.js";

// ─── Adapter-layer guard ──────────────────────────────────────────────────────

describe("TelegramOwnerAdapter — agent_role guard", () => {
  const BASE_CONFIG = {
    bot_token: "test:TOKEN",
    owner_chat_id: "12345",
    tenant_id: "test-tenant",
  };

  it("allows instantiation when agent_role is 'penelope'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "penelope" })
    ).not.toThrow();
  });

  it("throws when agent_role is 'customer-frontend'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({
          ...BASE_CONFIG,
          agent_role: "customer-frontend",
        })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'booking'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "booking" })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'quoting'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "quoting" })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'payment-reconciler'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({
          ...BASE_CONFIG,
          agent_role: "payment-reconciler",
        })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'review-ask'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "review-ask" })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'marketing'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "marketing" })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("throws when agent_role is 'daily-brief'", () => {
    expect(
      () =>
        new TelegramOwnerAdapter({
          ...BASE_CONFIG,
          agent_role: "daily-brief",
        })
    ).toThrow(/TelegramOwnerAdapter refused/);
  });

  it("error message includes the offending role name", () => {
    expect(() =>
      new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "booking" })
    ).toThrow(/agent_role="booking"/);
  });

  it("error message includes guidance to use the bus", () => {
    expect(() =>
      new TelegramOwnerAdapter({ ...BASE_CONFIG, agent_role: "marketing" })
    ).toThrow(/loom-a2a internal bus/);
  });
});

// ─── Agent-layer guard ────────────────────────────────────────────────────────

class ConcreteSpecialist extends SpecialistAgent {
  async run(_payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  // Expose the protected method for testing
  public tryAcquireTelegramOwnerAdapter(): never {
    return this.acquireTelegramOwnerAdapter();
  }
}

describe("SpecialistAgent.acquireTelegramOwnerAdapter() guard", () => {
  const specialistRoles: SpecialistConfig["role"][] = [
    "customer-frontend",
    "booking",
    "quoting",
    "payment-reconciler",
    "review-ask",
    "marketing",
    "daily-brief",
  ];

  for (const role of specialistRoles) {
    it(`throws for role "${role}"`, () => {
      const agent = new ConcreteSpecialist({ role, tenant_id: "test-tenant" });
      expect(() => agent.tryAcquireTelegramOwnerAdapter()).toThrow(
        /SpecialistAgent.*attempted to acquire the telegram-owner adapter/
      );
    });
  }
});

// ─── Schema-layer guard (validateAgentConfig) ─────────────────────────────────

const MINIMAL_VALID_CONFIG: TenantConfig = {
  schema_version: 1,
  tenant_id: "test",
  name: "Test Tenant",
  vertical: "auto-service",
  brand: { display_name: "Test", brand_color: "#000" },
  hours: { timezone: "UTC", schedule: {} },
  channels: [
    {
      type: "telegram-owner",
      enabled: true,
      credential_env: "BOT_TOKEN",
    },
  ],
  agents: {
    penelope: {
      role: "penelope",
      telegram_owner: {
        bot_token_env: "BOT_TOKEN",
        owner_chat_id_env: "OWNER_CHAT_ID",
      },
    },
    specialists: [
      { role: "customer-frontend", enabled: true },
      { role: "booking", enabled: true },
    ],
  },
};

describe("validateAgentConfig()", () => {
  it("passes for a valid config with penelope head agent", () => {
    expect(() => validateAgentConfig(MINIMAL_VALID_CONFIG)).not.toThrow();
  });

  it("throws when agents block is missing", () => {
    const bad = { ...MINIMAL_VALID_CONFIG } as Partial<TenantConfig>;
    delete (bad as Record<string, unknown>)["agents"];
    expect(() => validateAgentConfig(bad as TenantConfig)).toThrow(
      /missing required "agents" block/
    );
  });

  it("throws when penelope role is wrong", () => {
    const bad: TenantConfig = {
      ...MINIMAL_VALID_CONFIG,
      agents: {
        ...MINIMAL_VALID_CONFIG.agents,
        penelope: {
          ...MINIMAL_VALID_CONFIG.agents.penelope,
          role: "booking" as "penelope",
        },
      },
    };
    expect(() => validateAgentConfig(bad)).toThrow(/role must be "penelope"/);
  });

  it("throws when a specialist claims role=penelope", () => {
    const bad: TenantConfig = {
      ...MINIMAL_VALID_CONFIG,
      agents: {
        ...MINIMAL_VALID_CONFIG.agents,
        specialists: [
          { role: "penelope" as "customer-frontend", enabled: true },
        ],
      },
    };
    expect(() => validateAgentConfig(bad)).toThrow(
      /specialist with role="penelope"/
    );
  });

  it("throws when telegram-owner channel is absent", () => {
    const bad: TenantConfig = {
      ...MINIMAL_VALID_CONFIG,
      channels: [],
    };
    expect(() => validateAgentConfig(bad)).toThrow(/no telegram-owner channel/);
  });
});
