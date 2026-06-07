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
    'returns null for %s — Forward Email requires a separate IMAP credential not in the schema',
    (provider) => {
      expect(resolveImapSettings(account({ provider }))).toBeNull();
    }
  );

  it('does not mark Forward Email accounts as IMAP-readable', () => {
    expect(hasSupportedImapProvider({
      provider: 'forwardemail',
      smtpHost: 'smtp.forwardemail.net',
    })).toBe(false);
  });
});
