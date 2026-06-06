import { describe, expect, it } from 'vitest';
import { buildEmailAccountLoadError, buildInboxLoadError, buildSmtpCheckError } from './errors';
import type { EmailAccount } from '@/lib/email-accounts';

const forwardEmailAccount = {
  provider: 'forwardemail',
  smtpHost: 'smtp.forwardemail.net',
} as EmailAccount;

describe('email reader error messages', () => {
  it('treats Forward Email NONEXISTENT SELECT failures as mailbox availability issues', () => {
    expect(buildInboxLoadError(
      new Error('Command failed | SELECT completed | 9 NO [NONEXISTENT] SELECT completed | NONEXISTENT'),
      forwardEmailAccount
    )).toEqual({
      error: 'Forward Email mailbox is not available.',
      details: 'Command failed | SELECT completed | 9 NO [NONEXISTENT] SELECT completed | NONEXISTENT',
      solution: 'Forward Email accepted the connection far enough to select a mailbox, but the inbox was not available. In Forward Email, make sure the alias exists as a mailbox with IMAP access enabled, generate an alias-specific password, then send a test message to the alias and recheck the account. Use imap.forwardemail.net on port 993 with SSL/TLS; port 2993 is also supported.',
      docsUrl: 'https://forwardemail.net/en/faq',
    });
  });

  it('turns generic Forward Email IMAP command failures into actionable setup guidance', () => {
    expect(buildInboxLoadError(new Error('Command failed'), forwardEmailAccount)).toEqual({
      error: 'Forward Email IMAP login failed.',
      details: 'Command failed',
      solution: 'Use the full alias email address as the username and the alias-specific generated password from Forward Email. The inbox uses imap.forwardemail.net on port 993 with SSL/TLS; port 2993 is also supported.',
      docsUrl: 'https://forwardemail.net/en/faq',
    });
  });

  it('uses SMTP-specific wording for Forward Email SMTP checks', () => {
    expect(buildSmtpCheckError('SMTP command failed: 535 Authentication failed', forwardEmailAccount)).toMatchObject({
      error: 'Forward Email SMTP login failed.',
      details: 'SMTP command failed: 535 Authentication failed',
    });
  });

  it('explains missing encryption keys when saved accounts cannot be read', () => {
    expect(buildEmailAccountLoadError(new Error('ENCRYPTION_KEY is required to store SMTP credentials'))).toMatchObject({
      error: 'Email account credentials cannot be decrypted because ENCRYPTION_KEY is not configured.',
    });
  });
});
