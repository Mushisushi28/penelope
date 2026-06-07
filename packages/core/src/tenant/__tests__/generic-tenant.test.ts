/**
 * Validation tests for the example auto-service tenant config.
 *
 * Ensures the example tenant file parses cleanly against TenantConfigSchema
 * before any agent tries to load it at runtime.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeParseTenantConfig, validateTenantConfig } from '../schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve examples/auto-service/tenant.json relative to this test file
// packages/core/src/tenant/__tests__/ → ../../../../examples/auto-service/tenant.json
const EXAMPLE_TENANT_PATH = join(__dirname, '..', '..', '..', '..', '..', 'examples', 'auto-service', 'tenant.json');

function loadExampleTenant(): unknown {
  const raw = readFileSync(EXAMPLE_TENANT_PATH, 'utf-8');
  return JSON.parse(raw);
}

describe('examples/auto-service/tenant.json', () => {
  it('parses cleanly against TenantConfigSchema', () => {
    const raw = loadExampleTenant();
    const result = safeParseTenantConfig(raw);
    if (!result.success) {
      // Surface the full Zod error for easier debugging
      throw new Error(
        `Example tenant.json failed validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('has tenant_id set', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(typeof config.tenant_id).toBe('string');
    expect(config.tenant_id.length).toBeGreaterThan(0);
  });

  it('has vertical "auto-service"', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(config.vertical).toBe('auto-service');
  });

  it('has a city set in address', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(typeof config.address?.city).toBe('string');
    expect(config.address?.city.length).toBeGreaterThan(0);
  });

  it('uses a valid IANA timezone', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(typeof config.hours.timezone).toBe('string');
    // Basic sanity: IANA zones contain a slash
    expect(config.hours.timezone).toContain('/');
  });

  it('has at least one channel configured', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(config.channels.length).toBeGreaterThan(0);
  });

  it('has fb-page channel enabled', () => {
    const config = validateTenantConfig(loadExampleTenant());
    const fb = config.channels.find((c) => c.type === 'fb-page');
    expect(fb).toBeDefined();
    expect(fb?.enabled).toBe(true);
  });

  it('has at least one pricing rule with floor and ceiling', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(config.pricing.length).toBeGreaterThan(0);
    const first = config.pricing[0];
    if (!first) throw new Error('Expected at least one pricing rule');
    expect(typeof first.floor).toBe('number');
    expect(typeof first.ceiling).toBe('number');
    expect(first.ceiling).toBeGreaterThan(first.floor);
  });

  it('pricing auto_quote_band is within [floor, ceiling]', () => {
    const config = validateTenantConfig(loadExampleTenant());
    for (const rule of config.pricing) {
      expect(rule.auto_quote_band[0]).toBeGreaterThanOrEqual(rule.floor);
      expect(rule.auto_quote_band[1]).toBeLessThanOrEqual(rule.ceiling);
    }
  });

  it('brand has a name field', () => {
    const config = validateTenantConfig(loadExampleTenant());
    expect(typeof config.brand.name).toBe('string');
    expect(config.brand.name.length).toBeGreaterThan(0);
  });

  it('has no real secrets — credential fields reference env var names only', () => {
    const raw = JSON.stringify(loadExampleTenant());
    // Ensure no hardcoded token patterns (e.g. EAAxxxxx = FB page token)
    expect(raw).not.toMatch(/EAA[A-Za-z0-9]{20,}/);
    // No Square access tokens
    expect(raw).not.toMatch(/sq0atp-/);
    // No real Telegram IDs or page IDs embedded
    expect(raw).not.toContain('7949309437');
    expect(raw).not.toContain('815642964958116');
  });
});
