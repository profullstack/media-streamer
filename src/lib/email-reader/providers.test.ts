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
    imapHost: null,
    imapPort: null,
    imapSecurity: null,
    imapUsername: null,
    imapPassword: null,
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
    'maps %s to Forward Email IMAP settings using stored credentials',
    (provider) => {
      expect(resolveImapSettings(account({ provider }))).toMatchObject({
        host: 'imap.forwardemail.net',
        port: 993,
        secure: true,
        loginMethod: 'LOGIN',
        username: 'me@example.com',
        password: 'password',
      });
    }
  );

  it('marks Forward Email accounts as IMAP-readable', () => {
    expect(hasSupportedImapProvider({
      provider: 'forwardemail',
      smtpHost: 'smtp.forwardemail.net',
    })).toBe(true);
  });

  it('uses explicit IMAP password over SMTP password when set', () => {
    expect(resolveImapSettings(account({
      provider: 'forwardemail',
      imapPassword: 'imap-specific-password',
    }))).toMatchObject({
      password: 'imap-specific-password',
    });
  });
});
