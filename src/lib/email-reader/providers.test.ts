import { describe, expect, it } from 'vitest';
import { hasSupportedImapProvider, resolveImapSettings } from './providers';
import type { EmailAccount } from '@/lib/email-accounts';

function account(overrides: Partial<EmailAccount>): EmailAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    label: 'Forward Email',
    provider: null,
    fromEmail: 'me@example.com',
    fromName: null,
    replyToEmail: null,
    smtpHost: 'smtp.forwardemail.net',
    smtpPort: 465,
    smtpSecurity: 'tls',
    smtpUsername: 'me@example.com',
    smtpPassword: 'password',
    isDefault: true,
    lastCheckedAt: null,
    lastCheckStatus: 'unchecked',
    lastCheckError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveImapSettings', () => {
  it.each(['gmail', 'google'])(
    'maps %s to Gmail IMAP settings',
    (provider) => {
      expect(resolveImapSettings(account({
        provider,
        label: 'Gmail',
        smtpHost: 'smtp.gmail.com',
      }))).toEqual({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        username: 'me@example.com',
        password: 'password',
      });
    }
  );

  it.each(['forwardemail', 'forwardemail.net', 'forwardmail', 'forwardmail.net', 'forwardedemail', 'forwardedemail.net'])(
    'maps %s to Forward Email IMAP settings',
    (provider) => {
      expect(resolveImapSettings(account({ provider }))).toEqual({
        host: 'imap.forwardemail.net',
        port: 993,
        alternatePorts: [2993],
        secure: true,
        loginMethod: 'LOGIN',
        username: 'me@example.com',
        password: 'password',
      });
    }
  );

  it('detects Forward Email as readable without requiring decrypted credentials', () => {
    expect(hasSupportedImapProvider({
      provider: 'forwardemail',
      smtpHost: 'smtp.forwardemail.net',
    })).toBe(true);
  });

  it('uses the full alias email as the Forward Email IMAP username', () => {
    expect(resolveImapSettings(account({
      provider: 'forwardemail',
      smtpUsername: 'wrong-user',
    }))).toMatchObject({
      loginMethod: 'LOGIN',
      username: 'me@example.com',
    });
  });
});
