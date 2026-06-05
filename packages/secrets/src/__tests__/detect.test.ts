import { describe, it, expect } from 'vitest';
import { storeForPlatform } from '../detect.js';
import { DpapiStore } from '../store-dpapi.js';
import { KeychainStore } from '../store-keychain.js';
import { LibsecretStore } from '../store-libsecret.js';
import { EncryptedFileStore } from '../store-encrypted-file.js';

describe('storeForPlatform', () => {
  it('returns DpapiStore for win32', () => {
    const store = storeForPlatform('win32');
    expect(store).toBeInstanceOf(DpapiStore);
    expect(store.capabilities().backend).toBe('dpapi');
  });

  it('returns KeychainStore for darwin', () => {
    const store = storeForPlatform('darwin');
    expect(store).toBeInstanceOf(KeychainStore);
    expect(store.capabilities().backend).toBe('keychain');
  });

  it('returns LibsecretStore for linux', () => {
    const store = storeForPlatform('linux');
    expect(store).toBeInstanceOf(LibsecretStore);
    expect(store.capabilities().backend).toBe('libsecret');
  });

  it('returns EncryptedFileStore for unknown platform', () => {
    const store = storeForPlatform('freebsd' as NodeJS.Platform);
    expect(store).toBeInstanceOf(EncryptedFileStore);
    expect(store.capabilities().backend).toBe('encrypted-file');
  });

  it('all platform stores report encryptedAtRest=true', () => {
    const platforms: NodeJS.Platform[] = ['win32', 'darwin', 'linux'];
    for (const p of platforms) {
      expect(storeForPlatform(p).capabilities().encryptedAtRest).toBe(true);
    }
  });
});
