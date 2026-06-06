import type { EmailAccount } from '@/lib/email-accounts';
import type { ImapConnectionSettings } from './types';

interface ProviderImapPreset {
  host: string;
  port: number;
  secure: boolean;
}

const providerPresets: Record<string, ProviderImapPreset | null> = {
  gmail: { host: 'imap.gmail.com', port: 993, secure: true },
  google: { host: 'imap.gmail.com', port: 993, secure: true },
  forwardemail: { host: 'imap.forwardemail.net', port: 993, secure: true },
  resend: null,
};

const smtpHostPresets: Record<string, ProviderImapPreset | null> = {
  'smtp.gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'smtp.forwardemail.net': { host: 'imap.forwardemail.net', port: 993, secure: true },
  'smtp.resend.com': null,
};

export function resolveImapSettings(account: EmailAccount): ImapConnectionSettings | null {
  const username = account.smtpUsername || account.fromEmail;
  if (!username || !account.smtpPassword) return null;

  const providerKey = account.provider?.trim().toLowerCase();
  const hostKey = account.smtpHost.trim().toLowerCase();
  const preset = providerKey && providerKey in providerPresets
    ? providerPresets[providerKey]
    : smtpHostPresets[hostKey];

  if (!preset) return null;

  return {
    ...preset,
    username,
    password: account.smtpPassword,
  };
}
