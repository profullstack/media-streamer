import type { EmailAccount, SmtpSecurity } from './types';

const FORWARD_EMAIL_PROVIDERS = new Set([
  'forwardemail',
  'forwardemail.net',
  'forwardmail',
  'forwardmail.net',
  'forwardedemail',
  'forwardedemail.net',
]);

// Ports that speak implicit TLS from the first byte (SMTPS). The client must
// open a TLS handshake immediately; STARTTLS/None here hangs until timeout.
const IMPLICIT_TLS_PORTS = new Set([465, 2465]);
// Submission/relay ports that start in plaintext and upgrade via STARTTLS.
const STARTTLS_PORTS = new Set([587, 2587, 2525, 25]);

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
  if (IMPLICIT_TLS_PORTS.has(smtpPort)) return 'tls';
  if (STARTTLS_PORTS.has(smtpPort)) return 'starttls';
  return smtpSecurity;
}

// Marker phrases used by the error builder to give a precise, non-generic
// message. Keep them in sync with buildSmtpCheckError's detection.
const IMPLICIT_TLS_MISMATCH = 'uses implicit TLS';
const STARTTLS_MISMATCH = 'uses STARTTLS';

/**
 * Rejects port/security combinations that cannot work, so the account fails
 * instantly with a readable reason instead of silently timing out after ~15s
 * (e.g. port 465 with STARTTLS waits forever for a plaintext banner that a
 * TLS-only port never sends). This never rewrites the user's input — it only
 * reports why the combination is invalid. Returns null when the combo is fine.
 */
export function validateSmtpPortSecurity(
  smtpPort: number,
  smtpSecurity: SmtpSecurity
): string | null {
  if (IMPLICIT_TLS_PORTS.has(smtpPort) && smtpSecurity !== 'tls') {
    return `Port ${smtpPort} ${IMPLICIT_TLS_MISMATCH} (SSL), but Security is set to "${smtpSecurity}". Set Security to "TLS".`;
  }
  if (STARTTLS_PORTS.has(smtpPort) && smtpSecurity === 'tls') {
    return `Port ${smtpPort} ${STARTTLS_MISMATCH}, but Security is set to "TLS". Set Security to "STARTTLS" (or "None").`;
  }
  return null;
}

export function isSmtpPortSecurityMismatch(message: string): boolean {
  return message.includes(IMPLICIT_TLS_MISMATCH) || message.includes(STARTTLS_MISMATCH);
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
