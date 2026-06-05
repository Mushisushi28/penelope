/**
 * Specialist base class.
 *
 * IMPORTANT ARCHITECTURAL RULE — read before extending this class:
 *
 *   You DO NOT message the owner directly.
 *   Report results to Penelope on the internal bus.
 *   Penelope decides what (if anything) the owner sees.
 *
 * Specialists communicate exclusively via the loom-a2a internal bus.
 * Any attempt to acquire a telegram-owner adapter from a specialist
 * instance throws a hard error at runtime.
 *
 * Org chart:
 *   USER ←─── telegram-owner ───→ PENELOPE
 *                                      │
 *                    ┌─────────────────┘
 *                    ▼
 *            Specialist (bus only)
 */

export type SpecialistRole =
  | 'customer-frontend'
  | 'booking'
  | 'quoting'
  | 'payment-reconciler'
  | 'review-ask'
  | 'marketing'
  | 'daily-brief'
  | 'browser'
  | 'follow-up'
  | 'content';

export interface SpecialistConfig {
  role: SpecialistRole;
  tenant_id: string;
}

export abstract class SpecialistAgent {
  readonly role: SpecialistRole;
  readonly tenantId: string;

  constructor(config: SpecialistConfig) {
    this.role = config.role;
    this.tenantId = config.tenant_id;
  }

  /**
   * Guard: specialists may never acquire a telegram-owner adapter.
   * Throws a descriptive error so the misconfiguration is caught at startup.
   */
  protected acquireTelegramOwnerAdapter(): never {
    throw new Error(
      `[Penelope] SpecialistAgent(${this.role}) attempted to acquire the telegram-owner adapter. ` +
        'Only Penelope (head agent) may use telegram-owner. ' +
        'Publish your result to the bus and let Penelope relay it to the owner.',
    );
  }

  /** Subclasses implement their core logic here. */
  abstract run(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}
