// Penelope head agent
export { classifyIntent, route, INTENT_TOPIC_MAP } from "./penelope/meta-router.js";
export type { InboundOwnerMessage, BusDispatch, Intent } from "./penelope/meta-router.js";

// Specialist base class
export { SpecialistAgent } from "./specialists/base.js";
export type { SpecialistConfig, SpecialistRole } from "./specialists/base.js";

// Telegram-owner adapter (Penelope-exclusive)
export { TelegramOwnerAdapter } from "./adapters/telegram-owner.js";
export type { TelegramOwnerConfig, OutboundOwnerMessage } from "./adapters/telegram-owner.js";

// Tenant schema
export { validateAgentConfig, TenantConfigError } from "./tenant/schema.js";
export type { TenantConfig, AgentConfig, PenelopeAgentConfig, SpecialistAgentConfig, AgentRole } from "./tenant/schema.js";
