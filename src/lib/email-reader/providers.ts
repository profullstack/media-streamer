import type { EmailAccount } from '@/lib/email-accounts';
import { isForwardEmailProvider } from '@/lib/email-accounts/provider-settings';
import type { ImapConnectionSettings } from './types';

interface ProviderImapPreset {
  host: string;
  port: number;
  alternatePorts?: number[];
  secure: boolean;
  loginMethod?: ImapConnectionSettings['loginMethod'];
}

interface ProviderAccount {
  provider: string | null;
  smtpHost: string;
}

const providerPresets: Record<string, ProviderImapPreset | null> = {
  gmail: { host: 'imap.gmail.com', port: 993, secure: true },
  google: { host: 'imap.gmail.com', port: 993, secure: true },
  forwardemail: { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  forwardmail: { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  'forwardemail.net': { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  'forwardmail.net': { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  forwardedemail: { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  'forwardedemail.net': { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  resend: null,
};

const smtpHostPresets: Record<string, ProviderImapPreset | null> = {
  'smtp.gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'smtp.forwardemail.net': { host: 'imap.forwardemail.net', port: 993, alternatePorts: [2993], secure: true, loginMethod: 'LOGIN' },
  'smtp.resend.com': null,
};

// Derive an IMAP host from the SMTP host the user already entered, so accounts
// configured with only SMTP credentials are still readable without making the
// user set up a separate IMAP server. Standard mailbox hosting exposes IMAP on
// imap.<domain>:993 (TLS); we map the common smtp.* / mail.* prefixes and fall
// back to prefixing imap. onto a bare domain.
function inferImapPreset(smtpHost: string): ProviderImapPreset | null {
  const host = smtpHost.trim().toLowerCase();
  if (!host || !host.includes('.')) return null;

  let imapHost: string;
  if (host.startsWith('smtp.')) imapHost = `imap.${host.slice('smtp.'.length)}`;
  else if (host.startsWith('mail.')) imapHost = `imap.${host.slice('mail.'.length)}`;
  else if (host.startsWith('imap.')) imapHost = host;
  else imapHost = `imap.${host}`;

  return { host: imapHost, port: 993, secure: true };
}

function resolveImapPreset(account: ProviderAccount): ProviderImapPreset | null {
  const providerKey = account.provider?.trim().toLowerCase();
  const hostKey = account.smtpHost.trim().toLowerCase();

  // Explicit provider preset wins (a null entry, e.g. resend, means the
  // provider is send-only and genuinely has no IMAP — don't infer one).
  if (providerKey && providerKey in providerPresets) {
    return providerPresets[providerKey];
  }
  // Explicit SMTP-host preset next (also honors null for send-only hosts).
  if (hostKey in smtpHostPresets) {
    return smtpHostPresets[hostKey];
  }
  // Otherwise infer IMAP from the SMTP host so custom SMTP accounts are
  // readable using the same credentials.
  return inferImapPreset(hostKey);
}

export function hasSupportedImapProvider(account: ProviderAccount): boolean {
  return Boolean(resolveImapPreset(account));
}

export function resolveImapSettings(account: EmailAccount): ImapConnectionSettings | null {
  const username = isForwardEmailProvider(account.provider, account.smtpHost)
    ? account.fromEmail
    : account.smtpUsername || account.fromEmail;
  if (!username || !account.smtpPassword) return null;

  const preset = resolveImapPreset(account);

  if (!preset) return null;

  return {
    ...preset,
    username,
    password: account.smtpPassword,
  };
}
