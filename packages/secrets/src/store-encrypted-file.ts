/**
 * Encrypted-file secret store — cross-platform fallback.
 *
 * Stores all secrets for a tenant in:
 *   ~/.penelope/secrets/<tenantId>.enc
 *
 * File format: JSON encrypted with AES-256-GCM.
 *   { iv: hex, salt: hex, tag: hex, data: hex }
 *
 * Master password resolution order:
 *   1. PENELOPE_VAULT_PASSWORD env var
 *   2. Prompt via @inquirer/prompts (if stdin is a TTY)
 *   3. Throw — cannot proceed without password
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { SecretRef, SecretStore, StoreCapabilities } from './types.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_N = 16384;

interface EncryptedPayload {
  iv: string;
  salt: string;
  tag: string;
  data: string;
}

/** In-memory plaintext store for a single tenant file. */
type PlainStore = Record<string, string>; // key → value

// ── Crypto helpers ────────────────────────────────────────────────────────────

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N }) as Buffer;
}

function encrypt(plaintext: string, password: string): EncryptedPayload {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

function decrypt(payload: EncryptedPayload, password: string): string {
  const salt = Buffer.from(payload.salt, 'hex');
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const data = Buffer.from(payload.data, 'hex');
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

// ── Password resolution ───────────────────────────────────────────────────────

async function resolvePassword(): Promise<string> {
  const fromEnv = process.env['PENELOPE_VAULT_PASSWORD'];
  if (fromEnv) return fromEnv;

  if (process.stdin.isTTY) {
    const { password } = await import('@inquirer/prompts');
    return password({ message: 'Penelope vault password:' });
  }

  throw new Error(
    'PENELOPE_VAULT_PASSWORD is not set and stdin is not a TTY. ' +
    'Set the env var to use the encrypted-file store non-interactively.'
  );
}

// ── Store class ───────────────────────────────────────────────────────────────

export class EncryptedFileStore implements SecretStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), '.penelope', 'secrets');
  }

  capabilities(): StoreCapabilities {
    return {
      persistent: true,
      encryptedAtRest: true,
      backend: 'encrypted-file',
    };
  }

  async available(): Promise<boolean> {
    return true; // always available — only needs node:crypto
  }

  private filePath(tenantId: string): string {
    return join(this.baseDir, `${tenantId}.enc`);
  }

  private async loadStore(tenantId: string, password: string): Promise<PlainStore> {
    const fp = this.filePath(tenantId);
    if (!existsSync(fp)) return {};
    const raw = readFileSync(fp, 'utf8');
    const payload = JSON.parse(raw) as EncryptedPayload;
    const plain = decrypt(payload, password);
    return JSON.parse(plain) as PlainStore;
  }

  private saveStore(tenantId: string, store: PlainStore, password: string): void {
    mkdirSync(this.baseDir, { recursive: true });
    const payload = encrypt(JSON.stringify(store), password);
    writeFileSync(this.filePath(tenantId), JSON.stringify(payload, null, 2));
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    const pw = await resolvePassword();
    const store = await this.loadStore(ref.tenantId, pw);
    store[ref.key] = value;
    this.saveStore(ref.tenantId, store, pw);
  }

  async get(ref: SecretRef): Promise<string | undefined> {
    const pw = await resolvePassword();
    const store = await this.loadStore(ref.tenantId, pw);
    return store[ref.key];
  }

  async delete(ref: SecretRef): Promise<void> {
    const pw = await resolvePassword();
    const store = await this.loadStore(ref.tenantId, pw);
    delete store[ref.key];
    this.saveStore(ref.tenantId, store, pw);
  }

  async list(tenantId: string): Promise<SecretRef[]> {
    const pw = await resolvePassword();
    const store = await this.loadStore(tenantId, pw);
    return Object.keys(store).map((key) => ({ tenantId, key }));
  }
}
