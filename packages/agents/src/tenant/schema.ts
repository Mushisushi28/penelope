/**
 * Tenant configuration schema — agents package copy.
 *
 * Canonical implementation lives in packages/core/src/tenant/schema.ts.
 * This copy is vendored into @penelope/agents so the package can be tested
 * independently before @penelope/core is published.
 *
 * When @penelope/core is on npm, replace this file with:
 *   export * from "@penelope/core/tenant/schema";
 */

export type HeadAgentRole = "penelope";

export type SpecialistRole =
  | "customer-frontend"
  | "booking"
  | "quoting"
  | "payment-reconciler"
  | "review-ask"
  | "marketing"
  | "daily-brief";

export type AgentRole = HeadAgentRole | SpecialistRole;

export interface PenelopeAgentConfig {
  role: HeadAgentRole;
  telegram_owner: {
    bot_token_env: string;
    owner_chat_id_env: string;
  };
  voice_character?: string;
}

export interface SpecialistAgentConfig {
  role: SpecialistRole;
  enabled: boolean;
  persona_override?: string;
}

export interface AgentConfig {
  penelope: PenelopeAgentConfig;
  specialists: SpecialistAgentConfig[];
}

export type ChannelType =
  | "telegram-owner"
  | "fb-page"
  | "sms-twilio"
  | "sms-textnow"
  | "sms-generic"
  | "imap-smtp"
  | "instagram-dm";

export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  credential_env: string;
  config?: Record<string, string>;
}

export interface TenantConfig {
  schema_version: number;
  tenant_id: string;
  name: string;
  vertical: string;
  brand: {
    display_name: string;
    brand_color: string;
    tagline?: string;
    voice_notes?: string;
  };
  address?: {
    city: string;
    province?: string;
    country: string;
    service_area?: string;
  };
  hours: {
    timezone: string;
    schedule: Record<string, { open: string; close: string } | null>;
  };
  quiet_hours?: { start: string; end: string; notes?: string };
  channels: ChannelConfig[];
  agents: AgentConfig;
  pricing?: unknown[];
  booking?: unknown;
  payment_processors?: unknown[];
  review_platforms?: unknown[];
  approval_gates?: unknown;
  approval_required?: string[];
  budget?: { max_usd_per_day: number; max_usd_per_month: number; alert_threshold_pct: number };
}

export class TenantConfigError extends Error {
  constructor(message: string) {
    super(`[TenantConfig] ${message}`);
    this.name = "TenantConfigError";
  }
}

export function validateAgentConfig(config: TenantConfig): void {
  const agents = (config as Record<string, unknown>)["agents"] as AgentConfig | undefined;

  if (!agents) {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" is missing required "agents" block. ` +
        "Add a penelope head agent and any specialists.",
    );
  }

  if (agents.penelope.role !== "penelope") {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" agents.penelope.role must be "penelope", ` +
        `got "${agents.penelope.role}".`,
    );
  }

  for (const specialist of agents.specialists) {
    if ((specialist.role as string) === "penelope") {
      throw new TenantConfigError(
        `tenant "${config.tenant_id}" has a specialist with role="penelope". ` +
          "Penelope is the head agent and cannot also be a specialist.",
      );
    }
  }

  const telegramChannel = config.channels.find((c) => c.type === "telegram-owner");
  if (!telegramChannel) {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" has no telegram-owner channel. ` +
        "Penelope requires a telegram-owner channel to communicate with the owner.",
    );
  }
}
