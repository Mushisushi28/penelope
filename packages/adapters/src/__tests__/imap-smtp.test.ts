/**
 * IMAP/SMTP adapter unit tests.
 * Focus: config parsing + constructor validation.
 * Does NOT require a live IMAP server — verifies config guard behaviour.
 */

import { describe, it, expect } from 'vitest';
import { ImapSmtpAdapter } from '../imap-smtp.js';
import { AdapterConfigError } from '../types.js';

const baseOpts = {
  tenant_id: 'acme',
  imap_host: 'imap.gmail.com',
  smtp_host: 'smtp.gmail.com',
  username: 'test@gmail.com',
  password: 'app-password-here',
  auth_type: 'app_password' as const,
  manualPolling: true,
};

describe('ImapSmtpAdapter constructor', () => {
  it('constructs successfully with app_password config', () => {
    const adapter = new ImapSmtpAdapter(baseOpts);
    expect(adapter.name).toBe('email');
  });

  it('throws AdapterConfigError when tenant_id is empty', () => {
    expect(() => new ImapSmtpAdapter({ ...baseOpts, tenant_id: '' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when imap_host is empty', () => {
    expect(() => new ImapSmtpAdapter({ ...baseOpts, imap_host: '' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when smtp_host is empty', () => {
    expect(() => new ImapSmtpAdapter({ ...baseOpts, smtp_host: '' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when username is empty', () => {
    expect(() => new ImapSmtpAdapter({ ...baseOpts, username: '' }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when password is missing for app_password auth', () => {
    expect(() => new ImapSmtpAdapter({ ...baseOpts, password: undefined }))
      .toThrow(AdapterConfigError);
  });

  it('throws AdapterConfigError when oauth2 block is missing for oauth2 auth', () => {
    expect(() => new ImapSmtpAdapter({
      ...baseOpts,
      auth_type: 'oauth2',
      password: undefined,
      oauth2: undefined,
    })).toThrow(AdapterConfigError);
  });

  it('constructs successfully with oauth2 config', () => {
    const adapter = new ImapSmtpAdapter({
      ...baseOpts,
      auth_type: 'oauth2',
      password: undefined,
      oauth2: {
        clientId: 'cid',
        clientSecret: 'csec',
        refreshToken: 'rt',
      },
    });
    expect(adapter.name).toBe('email');
  });

  it('defaults mailbox to INBOX when not specified', () => {
    const adapter = new ImapSmtpAdapter(baseOpts);
    // Access private field via cast for testing
    expect((adapter as unknown as { mailbox: string }).mailbox).toBe('INBOX');
  });

  it('uses from_address when specified, otherwise username', () => {
    const withFrom = new ImapSmtpAdapter({ ...baseOpts, from_address: 'noreply@acme.com' });
    expect((withFrom as unknown as { fromAddress: string }).fromAddress).toBe('noreply@acme.com');

    const withoutFrom = new ImapSmtpAdapter(baseOpts);
    expect((withoutFrom as unknown as { fromAddress: string }).fromAddress).toBe(baseOpts.username);
  });
});
