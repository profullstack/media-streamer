import { expect, test } from '@playwright/test';
import type { EmailAccount } from '../../src/lib/email-accounts';
import { normalizeEmailAccountSmtp } from '../../src/lib/email-accounts/provider-settings';
import { validateCreateEmailAccountInput } from '../../src/lib/email-accounts/validation';
import { resolveImapSettings } from '../../src/lib/email-reader/providers';

function savedForwardEmailAccount(overrides: Partial<EmailAccount> = {}): EmailAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    label: 'ForwardEmail.net',
    provider: 'forwardemail',
    fromEmail: 'hello@example.com',
    fromName: null,
    replyToEmail: null,
    smtpHost: 'smtp.forwardemail.net',
    smtpPort: 465,
    smtpSecurity: 'tls',
    smtpUsername: 'hello@example.com',
    smtpPassword: 'generated-alias-password',
    imapHost: null,
    imapPort: null,
    imapSecurity: null,
    imapUsername: null,
    imapPassword: null,
    isDefault: true,
    lastCheckedAt: null,
    lastCheckStatus: 'unchecked',
    lastCheckError: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test.describe('ForwardEmail.net email account contract', () => {
  test('normalizes submitted SMTP payload and runtime IMAP settings', () => {
    const input = validateCreateEmailAccountInput({
      label: 'ForwardEmail.net',
      provider: 'forwardmail.net',
      fromEmail: 'hello@example.com',
      smtpHost: 'smtp.forwardemail.net',
      smtpPort: 587,
      smtpSecurity: 'tls',
      smtpUsername: 'wrong-user',
      smtpPassword: 'generated-alias-password',
      isDefault: true,
    });

    expect(input).toEqual(expect.objectContaining({
      provider: 'forwardmail.net',
      fromEmail: 'hello@example.com',
      smtpHost: 'smtp.forwardemail.net',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      smtpUsername: 'hello@example.com',
      smtpPassword: 'generated-alias-password',
    }));

    const account = savedForwardEmailAccount({
      provider: input?.provider ?? null,
      fromEmail: input?.fromEmail,
      smtpHost: input?.smtpHost,
      smtpPort: input?.smtpPort,
      smtpSecurity: input?.smtpSecurity,
      smtpUsername: input?.smtpUsername,
      smtpPassword: input?.smtpPassword ?? '',
    });

    expect(resolveImapSettings(account)).toEqual({
      host: 'imap.forwardemail.net',
      port: 993,
      alternatePorts: [2993],
      secure: true,
      loginMethod: 'LOGIN',
      username: 'hello@example.com',
      password: 'generated-alias-password',
    });
  });

  test('repairs stale saved ForwardEmail SMTP username and security at runtime', () => {
    const account = savedForwardEmailAccount({
      smtpPort: 2465,
      smtpSecurity: 'starttls',
      smtpUsername: 'old-user',
    });

    expect(normalizeEmailAccountSmtp(account)).toEqual(expect.objectContaining({
      smtpPort: 2465,
      smtpSecurity: 'tls',
      smtpUsername: 'hello@example.com',
    }));

    expect(resolveImapSettings(account)).toEqual(expect.objectContaining({
      loginMethod: 'LOGIN',
      username: 'hello@example.com',
    }));
  });
});
