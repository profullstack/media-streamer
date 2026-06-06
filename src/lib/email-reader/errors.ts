import type { EmailAccount } from '@/lib/email-accounts';

export interface EmailErrorPayload {
  error: string;
  details?: string;
  solution?: string;
  docsUrl?: string;
}

const FORWARD_EMAIL_DOCS_URL = 'https://forwardemail.net/en/faq';

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const extra = error as Error & {
    response?: string;
    responseText?: string;
    serverResponse?: string;
    serverResponseCode?: string;
    command?: string;
    code?: string;
  };
  const parts = [
    error.message,
    extra.responseText,
    extra.serverResponse,
    extra.response,
    extra.serverResponseCode,
    extra.command ? `command=${extra.command}` : undefined,
    extra.code ? `code=${extra.code}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return Array.from(new Set(parts)).join(' | ');
}

function sanitizeDetail(value: string): string {
  return value
    .replace(/(pass(?:word)?|smtpPassword|imapPassword)=\S+/gi, '$1=[redacted]')
    .replace(/(pass(?:word)?|smtpPassword|imapPassword)["']?\s*:\s*["'][^"']+["']/gi, '$1: [redacted]')
    .slice(0, 500);
}

function isForwardEmailAccount(account: Pick<EmailAccount, 'provider' | 'smtpHost'> | null | undefined): boolean {
  const provider = account?.provider?.trim().toLowerCase();
  const smtpHost = account?.smtpHost.trim().toLowerCase();
  return (
    provider === 'forwardemail' ||
    provider === 'forwardemail.net' ||
    provider === 'forwardmail' ||
    provider === 'forwardmail.net' ||
    provider === 'forwardedemail' ||
    provider === 'forwardedemail.net' ||
    smtpHost === 'smtp.forwardemail.net'
  );
}

function isCredentialDecryptError(message: string): boolean {
  return message.includes('Failed to decrypt SMTP credential') ||
    message.includes('Invalid encrypted SMTP credential format');
}

function isMissingEncryptionKey(message: string): boolean {
  return message.includes('ENCRYPTION_KEY is required');
}

function isAuthLikeError(message: string): boolean {
  return /auth|login|credential|password|command failed/i.test(message);
}

function isMailboxUnavailableError(message: string): boolean {
  return /NONEXISTENT|SELECT/i.test(message);
}

function isNetworkLikeError(message: string): boolean {
  return /ECONN|ETIMEDOUT|ENOTFOUND|socket|TLS|certificate|timeout/i.test(message);
}

export function buildEmailAccountLoadError(error: unknown): EmailErrorPayload {
  const message = errorMessage(error);
  const details = sanitizeDetail(message);

  if (isMissingEncryptionKey(message)) {
    return {
      error: 'Email account credentials cannot be decrypted because ENCRYPTION_KEY is not configured.',
      details,
      solution: 'Set ENCRYPTION_KEY to the same value used when these accounts were saved, then restart the app. If the key was lost, edit each account in Settings and save a new password after setting the key.',
    };
  }

  if (isCredentialDecryptError(message)) {
    return {
      error: 'Stored email account credentials could not be decrypted.',
      details,
      solution: 'Restore the exact ENCRYPTION_KEY used when the account was saved, or edit the account in Settings and enter a new SMTP password.',
    };
  }

  return {
    error: 'Failed to load email accounts.',
    details,
    solution: 'Check the server logs for the database or credential error. If this started after adding an account, edit or remove that account from Settings once the credential issue is fixed.',
  };
}

export function buildInboxLoadError(
  error: unknown,
  account: Pick<EmailAccount, 'provider' | 'smtpHost'> | null | undefined
): EmailErrorPayload {
  const message = errorMessage(error);
  const details = sanitizeDetail(message);

  if (isMissingEncryptionKey(message) || isCredentialDecryptError(message)) {
    return buildEmailAccountLoadError(error);
  }

  if (isForwardEmailAccount(account) && isMailboxUnavailableError(message)) {
    return {
      error: 'Forward Email mailbox is not available.',
      details,
      solution: 'Forward Email accepted the connection far enough to select a mailbox, but the inbox was not available. In Forward Email, make sure the alias exists as a mailbox with IMAP access enabled, generate an alias-specific password, then send a test message to the alias and recheck the account. Use imap.forwardemail.net on port 993 with SSL/TLS; port 2993 is also supported.',
      docsUrl: FORWARD_EMAIL_DOCS_URL,
    };
  }

  if (isForwardEmailAccount(account) && isAuthLikeError(message)) {
    return {
      error: 'Forward Email IMAP login failed.',
      details,
      solution: 'Use the full alias email address as the username and the alias-specific generated password from Forward Email. The inbox uses imap.forwardemail.net on port 993 with SSL/TLS; port 2993 is also supported.',
      docsUrl: FORWARD_EMAIL_DOCS_URL,
    };
  }

  if (isNetworkLikeError(message)) {
    return {
      error: 'Could not connect to this mailbox.',
      details,
      solution: 'Verify the provider host, port, SSL/TLS setting, and that the server can reach the mail provider.',
    };
  }

  return {
    error: 'Failed to load inbox messages.',
    details,
    solution: 'Check the account username, password, IMAP provider support, and provider-specific app password requirements.',
  };
}

export function buildSmtpCheckError(
  error: unknown,
  account: Pick<EmailAccount, 'provider' | 'smtpHost'> | null | undefined
): EmailErrorPayload {
  const message = errorMessage(error);
  const details = sanitizeDetail(message);

  if (isMissingEncryptionKey(message) || isCredentialDecryptError(message)) {
    return buildEmailAccountLoadError(error);
  }

  if (isForwardEmailAccount(account) && isAuthLikeError(message)) {
    return {
      error: 'Forward Email SMTP login failed.',
      details,
      solution: 'Use smtp.forwardemail.net with port 465 SSL/TLS or port 587 STARTTLS. The username must be the full alias email address, and the password must be that alias-specific generated "Normal Password" from Forward Email.',
      docsUrl: FORWARD_EMAIL_DOCS_URL,
    };
  }

  if (isNetworkLikeError(message)) {
    return {
      error: 'Could not connect to this SMTP server.',
      details,
      solution: 'Verify the SMTP host, port, SSL/TLS setting, and that the server can reach the mail provider.',
    };
  }

  return {
    error: 'SMTP check failed.',
    details,
    solution: 'Check the account username, password, SMTP host, port, and provider-specific app password requirements.',
  };
}
