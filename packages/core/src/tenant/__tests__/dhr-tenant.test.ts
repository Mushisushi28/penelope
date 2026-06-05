/**
 * Validation tests for tenants/dhr/tenant.json.
 *
 * Ensures the DHR tenant file parses cleanly against TenantConfigSchema
 * before any agent tries to load it at runtime.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeParseTenantConfig, validateTenantConfig } from '../schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve tenants/dhr/tenant.json relative to this test file
// packages/core/src/tenant/__tests__/ → ../../../../tenants/dhr/tenant.json
const DHR_TENANT_PATH = join(__dirname, '..', '..', '..', '..', '..', 'tenants', 'dhr', 'tenant.json');

function loadDhrTenant(): unknown {
  const raw = readFileSync(DHR_TENANT_PATH, 'utf-8');
  return JSON.parse(raw);
}

describe('tenants/dhr/tenant.json', () => {
  it('parses cleanly against TenantConfigSchema', () => {
    const raw = loadDhrTenant();
    const result = safeParseTenantConfig(raw);
    if (!result.success) {
      // Surface the full Zod error for easier debugging
      throw new Error(
        `DHR tenant.json failed validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('has tenant_id "dhr"', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(config.tenant_id).toBe('dhr');
  });

  it('has vertical "auto-service"', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(config.vertical).toBe('auto-service');
  });

  it('has Lethbridge as city', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(config.address?.city).toBe('Lethbridge');
  });

  it('uses America/Edmonton timezone', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(config.hours.timezone).toBe('America/Edmonton');
  });

  it('has at least one channel configured', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(config.channels.length).toBeGreaterThan(0);
  });

  it('has fb-page channel enabled', () => {
    const config = validateTenantConfig(loadDhrTenant());
    const fb = config.channels.find((c) => c.type === 'fb-page');
    expect(fb).toBeDefined();
    expect(fb?.enabled).toBe(true);
  });

  it('has standard pricing with floor 100 and ceiling 200', () => {
    const config = validateTenantConfig(loadDhrTenant());
    const standard = config.pricing.find((p) => p.id === 'standard');
    expect(standard).toBeDefined();
    expect(standard?.floor).toBe(100);
    expect(standard?.ceiling).toBe(200);
    expect(standard?.currency).toBe('CAD');
  });

  it('has ceramic pricing with floor 200 and ceiling 250', () => {
    const config = validateTenantConfig(loadDhrTenant());
    const ceramic = config.pricing.find((p) => p.id === 'ceramic');
    expect(ceramic).toBeDefined();
    expect(ceramic?.floor).toBe(200);
    expect(ceramic?.ceiling).toBe(250);
  });

  it('pricing auto_quote_band is within [floor, ceiling]', () => {
    const config = validateTenantConfig(loadDhrTenant());
    for (const rule of config.pricing) {
      expect(rule.auto_quote_band[0]).toBeGreaterThanOrEqual(rule.floor);
      expect(rule.auto_quote_band[1]).toBeLessThanOrEqual(rule.ceiling);
    }
  });

  it('brand has a name field', () => {
    const config = validateTenantConfig(loadDhrTenant());
    expect(typeof config.brand.name).toBe('string');
    expect(config.brand.name.length).toBeGreaterThan(0);
  });

  it('has no real secrets — credential fields reference env var names only', () => {
    const raw = JSON.stringify(loadDhrTenant());
    // Ensure no hardcoded token patterns (e.g. EAAxxxxx = FB page token)
    expect(raw).not.toMatch(/EAA[A-Za-z0-9]{20,}/);
    // No Access tokens
    expect(raw).not.toMatch(/sq0atp-/);
  });
});
