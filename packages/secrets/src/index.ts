/**
 * @penelope/secrets — public API
 */

export type { SecretRef, SecretStore, StoreCapabilities } from './types.js';
export { refToKey, SERVICE_NAME } from './types.js';

export { DpapiStore } from './store-dpapi.js';
export { KeychainStore } from './store-keychain.js';
export { LibsecretStore } from './store-libsecret.js';
export { EncryptedFileStore } from './store-encrypted-file.js';

export { detectStore, storeForPlatform } from './detect.js';

export {
  setSecret,
  getSecret,
  deleteSecret,
  listSecrets,
  rotateSecret,
  promptSecretValue,
} from './cli-helpers.js';

export type { MigrationOptions, MigrationResult } from './migrate-from-plain.js';
export { migrateFromPlain } from './migrate-from-plain.js';
