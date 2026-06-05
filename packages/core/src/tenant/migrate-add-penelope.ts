/**
 * migrate-add-penelope.ts
 *
 * Migration helper: for existing tenant configs that pre-date the Penelope
 * rename (i.e. configs that have an "owner-agent" top-level key instead of
 * the "agents" block), auto-add the agents block on load so the config
 * passes validateAgentConfig().
 *
 * Usage:
 *   import { migrateAddPenelope } from '@penelope/core/tenant/migrate-add-penelope';
 *   const config = migrateAddPenelope(rawJson);
 *   validateAgentConfig(config);
 *
 * This is a non-destructive in-memory transform — it does NOT write back to
 * disk.  Call the CLI `penelope tenant migrate` to persist the upgrade.
 */

import type { TenantConfig, AgentConfig, SpecialistAgentConfig } from './schema.js';

/** Shape of a legacy owner-agent block (pre-Penelope rename). */
interface LegacyOwnerAgentBlock {
  bot_token_env?: string;
  owner_chat_id_env?: string;
  voice_character?: string;
}

/**
 * The default set of specialist agents injected when a tenant has no agents
 * block.  All are disabled by default so the tenant operator can opt-in.
 */
const DEFAULT_SPECIALISTS: SpecialistAgentConfig[] = [
  { role: 'customer-frontend', enabled: true },
  { role: 'booking', enabled: false },
  { role: 'quoting', enabled: false },
  { role: 'payment-reconciler', enabled: false },
  { role: 'review-ask', enabled: false },
  { role: 'marketing', enabled: false },
  { role: 'daily-brief', enabled: true },
];

/**
 * Inspect a raw parsed tenant config object and, if the `agents` block is
 * absent, synthesise one from legacy fields or sensible defaults.
 *
 * Returns the (possibly mutated) config object cast to TenantConfig.
 * If the config already has a valid `agents` block, it is returned unchanged.
 */
export function migrateAddPenelope(raw: Record<string, unknown>): TenantConfig {
  // Already migrated — nothing to do.
  if (raw['agents'] && typeof raw['agents'] === 'object') {
    return raw as unknown as TenantConfig;
  }

  // Try to carry forward legacy owner-agent settings.
  const legacy = raw['owner-agent'] as LegacyOwnerAgentBlock | undefined;

  const agentsBlock: AgentConfig = {
    penelope: {
      role: 'penelope',
      telegram_owner: {
        bot_token_env: legacy?.bot_token_env ?? 'OWNER_BOT_TOKEN',
        owner_chat_id_env: legacy?.owner_chat_id_env ?? 'OWNER_CHAT_ID',
      },
      ...(legacy?.voice_character
        ? { voice_character: legacy.voice_character }
        : {}),
    },
    specialists: DEFAULT_SPECIALISTS,
  };

  // Inject the agents block in-place.
  raw['agents'] = agentsBlock;

  // Remove the legacy key to avoid schema confusion.
  if ('owner-agent' in raw) {
    delete raw['owner-agent'];
  }

  return raw as unknown as TenantConfig;
}
