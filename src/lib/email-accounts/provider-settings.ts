import type { EmailAccount, SmtpSecurity } from './types';

const FORWARD_EMAIL_PROVIDERS = new Set([
  'forwardemail',
  'forwardemail.net',
  'forwardmail',
  'forwardmail.net',
  'forwardedemail',
  'forwardedemail.net',
]);

const FORWARD_EMAIL_TLS_PORTS = new Set([465, 2465]);
const FORWARD_EMAIL_STARTTLS_PORTS = new Set([587, 2587, 2525, 25]);

export function isForwardEmailProvider(provider: string | null | undefined, smtpHost: string): boolean {
  return FORWARD_EMAIL_PROVIDERS.has(provider?.trim().toLowerCase() ?? '') ||
    smtpHost.trim().toLowerCase() === 'smtp.forwardemail.net';
}

export function normalizeSmtpSecurity(
  provider: string | null | undefined,
  smtpHost: string,
  smtpPort: number,
  smtpSecurity: SmtpSecurity
): SmtpSecurity {
  if (!isForwardEmailProvider(provider, smtpHost)) return smtpSecurity;
  if (FORWARD_EMAIL_TLS_PORTS.has(smtpPort)) return 'tls';
  if (FORWARD_EMAIL_STARTTLS_PORTS.has(smtpPort)) return 'starttls';
  return smtpSecurity;
}

export function normalizeSmtpUsername(
  provider: string | null | undefined,
  smtpHost: string,
  fromEmail: string,
  smtpUsername: string | null | undefined
): string | null {
  if (isForwardEmailProvider(provider, smtpHost)) return fromEmail;
  return smtpUsername ?? null;
}

export function normalizeEmailAccountSmtp(account: EmailAccount): EmailAccount {
  return {
    ...account,
    smtpUsername: normalizeSmtpUsername(
      account.provider,
      account.smtpHost,
      account.fromEmail,
      account.smtpUsername
    ),
    smtpSecurity: normalizeSmtpSecurity(
      account.provider,
      account.smtpHost,
      account.smtpPort,
      account.smtpSecurity
    ),
  };
}
