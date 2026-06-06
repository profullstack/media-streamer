import { describe, expect, it } from 'vitest';
import { resolveImapSettings } from './providers';
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
  it.each(['forwardemail', 'forwardemail.net', 'forwardedemail', 'forwardedemail.net'])(
    'maps %s to Forward Email IMAP settings',
    (provider) => {
      expect(resolveImapSettings(account({ provider }))).toEqual({
        host: 'imap.forwardemail.net',
        port: 993,
        secure: true,
        username: 'me@example.com',
        password: 'password',
      });
    }
  );
});
