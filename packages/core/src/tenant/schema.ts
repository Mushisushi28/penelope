/**
 * Tenant configuration schema.
 *
 * Every tenant has exactly one Penelope head agent and zero-or-more
 * specialists. Only Penelope may use the telegram-owner adapter.
 *
 * Org chart (locked):
 *   USER ←─── telegram-owner ───→ PENELOPE (head agent)
 *                                      │
 *          ┌──────┬──────┬────────┬────┴───┬──────┬──────────┐
 *          ▼      ▼      ▼        ▼         ▼      ▼          ▼
 *      customer booking quoting payments reviews marketing daily-brief
 *      (bus only — never touch telegram-owner)
 */

// ── Agent roles ──────────────────────────────────────────────────────────────

/** The only role that may acquire the telegram-owner adapter. */
export type HeadAgentRole = 'penelope';

/** Roles that are bus-only (loom-a2a internal only, no telegram-owner access). */
export type SpecialistRole =
  | 'customer-frontend'
  | 'booking'
  | 'quoting'
  | 'payment-reconciler'
  | 'review-ask'
  | 'marketing'
  | 'daily-brief';

export type AgentRole = HeadAgentRole | SpecialistRole;

// ── Agent config shapes ───────────────────────────────────────────────────────

export interface PenelopeAgentConfig {
  role: HeadAgentRole;
  /** Telegram-owner channel config. Required for Penelope. */
  telegram_owner: {
    bot_token_env: string;
    owner_chat_id_env: string;
  };
  /** Optional TTS voice for voice-in / voice-out. */
  voice_character?: string;
}

export interface SpecialistAgentConfig {
  role: SpecialistRole;
  enabled: boolean;
  /** Override the persona YAML path. Defaults to built-in persona for the role. */
  persona_override?: string;
}

export interface AgentConfig {
  /** The head agent. Exactly one per tenant. */
  penelope: PenelopeAgentConfig;
  /** Specialist agents. Bus-only; never touch telegram-owner. */
  specialists: SpecialistAgentConfig[];
}

// ── Channel config ────────────────────────────────────────────────────────────

export type ChannelType =
  | 'telegram-owner'
  | 'fb-page'
  | 'sms-twilio'
  | 'sms-textnow'
  | 'sms-generic'
  | 'imap-smtp'
  | 'instagram-dm';

export interface ChannelConfig {
  type: ChannelType;
  enabled: boolean;
  credential_env: string;
  config?: Record<string, string>;
}

// ── Tenant config ─────────────────────────────────────────────────────────────

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

  quiet_hours?: {
    start: string;
    end: string;
    notes?: string;
  };

  channels: ChannelConfig[];

  /** Agent configuration. Penelope is head; specialists are bus-only. */
  agents: AgentConfig;

  pricing?: Array<{
    id: string;
    label: string;
    currency: string;
    floor: number;
    ceiling?: number;
    cap?: number;
    auto_quote_band?: [number, number];
    qualifier_question?: string;
    modifiers?: Record<string, unknown>;
    warranty_years?: number;
    surcharge_on_standard?: { min: number; max: number };
  }>;

  booking?: {
    provider: string;
    url_env: string;
    url_placeholder?: string;
    available_slots?: string;
  };

  payment_processors?: Array<{
    name: string;
    credential_env: string;
    location_id_env?: string;
  }>;

  review_platforms?: Array<{
    name: string;
    url_env: string;
  }>;

  approval_gates?: {
    default_level: string;
    above_band_level: string;
    complaint_level: string;
    escalation_contacts?: Array<{
      id: string;
      type: string;
      description?: string;
      credential_env: string;
    }>;
  };

  approval_required?: string[];

  budget?: {
    max_usd_per_day: number;
    max_usd_per_month: number;
    alert_threshold_pct: number;
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export class TenantConfigError extends Error {
  constructor(message: string) {
    super(`[TenantConfig] ${message}`);
    this.name = 'TenantConfigError';
  }
}

/**
 * Validate that the agents block is correctly structured:
 * - Exactly one penelope head agent
 * - No specialist with role "penelope"
 * - telegram-owner channel is present and maps to penelope
 */
export function validateAgentConfig(config: TenantConfig): void {
  const { agents } = config;

  if (!agents) {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" is missing required "agents" block. ` +
        'Add a penelope head agent and any specialists.',
    );
  }

  if (agents.penelope.role !== 'penelope') {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" agents.penelope.role must be "penelope", ` +
        `got "${agents.penelope.role}".`,
    );
  }

  for (const specialist of agents.specialists) {
    if ((specialist.role as string) === 'penelope') {
      throw new TenantConfigError(
        `tenant "${config.tenant_id}" has a specialist with role="penelope". ` +
          'Penelope is the head agent and cannot also be a specialist.',
      );
    }
  }

  // Ensure telegram-owner channel is present and wired to penelope
  const telegramChannel = config.channels.find((c) => c.type === 'telegram-owner');
  if (!telegramChannel) {
    throw new TenantConfigError(
      `tenant "${config.tenant_id}" has no telegram-owner channel. ` +
        'Penelope requires a telegram-owner channel to communicate with the owner.',
    );
  }
}
