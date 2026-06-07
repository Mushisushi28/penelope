/**
 * Core tenant model types for Penelope.
 *
 * A "tenant" is one small business plugged into the platform.
 * Each tenant is isolated: its own directory tree, bus, secrets, agents,
 * and procedure library.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Vertical determines which default procedure templates are installed. */
export type BusinessVertical =
  | 'auto-service'      // headlight restoration, detailing, mechanic
  | 'home-services'     // cleaning, lawn, handyman, HVAC
  | 'personal-services' // barber, salon, spa, tattoo
  | 'food-beverage'     // cafe, food truck, catering
  | 'retail'            // local shop, e-comm hybrid
  | 'professional'      // web design, accounting, consulting
  | 'fitness'           // gym, yoga, personal training
  | 'custom';           // unknown/other — no default templates

/** Supported inbound/outbound messaging channels. */
export type Channel =
  | 'fb-page'           // Facebook Messenger via Graph API
  | 'instagram-dm'      // Instagram DMs (shared FB Graph)
  | 'sms-twilio'        // Twilio programmable SMS
  | 'sms-textnow'       // TextNow DOM-scraped (free tier)
  | 'sms-generic'       // Any SMS via webhook
  | 'email-gmail'       // Gmail via App Password or OAuth
  | 'email-outlook'     // ms-365-mcp or SMTP
  | 'email-sendgrid'    // SendGrid inbound parse
  | 'whatsapp'          // WhatsApp Business API
  | 'telegram-owner'    // Owner's Telegram (owner-agent I/O)
  | 'web-form'          // HTML form webhook
  | 'beeper';           // Beeper bridge (Jarvis-specific)

/** Payment processor integrations. */
export type PaymentProcessor =
  | 'square'
  | 'stripe'
  | 'paypal'
  | 'manual';

/** Approval gate levels for outbound actions. */
export type ApprovalLevel =
  | 'auto'                   // Agent proceeds without human
  | 'team_lead_approve'      // Team lead reviews before send
  | 'ceo_approve'            // CEO bot approves
  | 'owner_telegram_confirm' // Plain Telegram yes/no from owner
  | 'owner_totp';            // TOTP token required from owner

// ---------------------------------------------------------------------------
// Sub-models
// ---------------------------------------------------------------------------

/** Day-of-week hours for a single day. null = closed. */
export interface DayHours {
  open: string;    // HH:MM (24h)
  close: string;   // HH:MM (24h)
}

/** Business operating hours, by weekday. */
export interface BusinessHours {
  timezone: string;        // IANA timezone, e.g. "America/Vancouver"
  monday?: DayHours | null;
  tuesday?: DayHours | null;
  wednesday?: DayHours | null;
  thursday?: DayHours | null;
  friday?: DayHours | null;
  saturday?: DayHours | null;
  sunday?: DayHours | null;
  /** No proactive outbound before this time (HH:MM). Default "08:00". */
  quiet_before?: string;
  /** No proactive outbound after this time (HH:MM). Default "22:00". */
  quiet_after?: string;
}

/**
 * Pricing rule for a single service category.
 * floor/ceiling define the auto-quote band; outside = escalate.
 */
export interface PricingRule {
  /** Unique key for this rule, e.g. "regular", "ceramic", "bulbs" */
  id: string;
  label: string;
  currency: string;             // ISO 4217, e.g. "CAD"
  floor: number;
  ceiling: number;
  /** Inclusive band where agent can quote autonomously. */
  auto_quote_band: [number, number];
  /** If true, agent must look up price externally (e.g. Amazon ASIN). */
  requires_lookup?: boolean;
  /** qualifier_question to ask customer before quoting */
  qualifier_question?: string;
  notes?: string;
}

/**
 * Per-action approval gate configuration.
 * Controls which action classes require which approval level.
 */
export interface ApprovalGate {
  /** Human-readable label for this gate, e.g. "reply_to_new_customer" */
  action: string;
  level: ApprovalLevel;
  /** Conditions that trigger this gate (freeform, used by procedure loader) */
  conditions?: string[];
  notes?: string;
}

/** A single channel configuration entry. */
export interface ChannelConfig {
  type: Channel;
  enabled: boolean;
  /** Reference to the env var that holds credentials, e.g. "FB_PAGE_TOKEN" */
  credential_env?: string;
  /** Webhook URL or incoming endpoint, if applicable */
  webhook_url?: string;
  /** Channel-specific settings (page_id, phone_number, etc.) */
  settings?: Record<string, string | number | boolean>;
}

/** Branding / identity info for the business. */
export interface BrandConfig {
  name: string;               // Display name, e.g. "Sample Mobile Service"
  short_name?: string;        // Short name for SMS, e.g. "SMS"
  brand_color?: string;       // Hex color, e.g. "#e53e3e"
  logo_url?: string;
  website_url?: string;
  service_area?: string;      // Human-readable, e.g. "Calgary, AB and surroundings"
  /** Voice/tone descriptor used by agent personas */
  voice_tone?: string;
  /** Phrases agents must never say */
  forbidden_phrases?: string[];
  /** Emoji policy for customer-facing messages */
  emoji_policy?: 'none' | 'minimal' | 'match-customer';
}

/** Review platform configuration. */
export interface ReviewPlatform {
  type: 'google' | 'facebook' | 'yelp' | 'trustpilot' | 'custom';
  label?: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Top-level TenantConfig
// ---------------------------------------------------------------------------

/**
 * TenantConfig is the canonical configuration for a single business tenant.
 * Lives at `tenants/<id>/tenant.json` (or `examples/<id>/tenant.json` for examples).
 *
 * This is loaded at agent spawn time; changes take effect on next spawn.
 * Never store secrets here — use the tenant's `.secrets/` or OS keychain.
 */
export interface TenantConfig {
  /** Schema version for forward-compat checks. Current: 1 */
  schema_version: 1;

  /** Unique tenant identifier. Slug-safe: [a-z0-9-_]. */
  tenant_id: string;

  /** Human-friendly display name. */
  name: string;

  /** Business vertical — determines default procedure templates. */
  vertical: BusinessVertical;

  brand: BrandConfig;

  /** Physical or service-area address. */
  address?: {
    street?: string;
    city: string;
    province_state: string;
    postal_code?: string;
    country: string;
  };

  hours: BusinessHours;

  /** Active channels for this tenant. */
  channels: ChannelConfig[];

  /** Pricing rules, keyed by service category. */
  pricing: PricingRule[];

  /** Approval gate overrides. Defaults come from vertical template. */
  approval_gates?: ApprovalGate[];

  /** Payment processors in use. */
  payment_processors?: PaymentProcessor[];

  /** Review platforms to drive review-ask automation. */
  review_platforms?: ReviewPlatform[];

  /** Quiet-hours outbound suspension. Defaults from business hours. */
  quiet_hours?: {
    enabled: boolean;
    respect_business_hours: boolean;
  };

  /** Shadow mode: all outbound queued for owner approval before send. */
  shadow_mode?: {
    enabled: boolean;
    /** Auto-promote procedure to live after N consecutive approvals. */
    auto_promote_after?: number;
  };

  /**
   * Per-tenant budget caps (in USD, approximate).
   * Specialists won't exceed these without escalating.
   */
  budget?: {
    daily_usd_cap?: number;
    monthly_usd_cap?: number;
    alert_at_pct?: number;   // e.g. 80 = alert at 80% of cap
  };

  /** Connector-specific settings (non-secret). */
  connectors?: Record<string, Record<string, string | number | boolean>>;

  /** Arbitrary per-tenant metadata. */
  meta?: Record<string, unknown>;
}
