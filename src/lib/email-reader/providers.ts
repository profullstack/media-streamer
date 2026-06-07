import type { EmailAccount } from '@/lib/email-accounts';
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

function resolveImapPreset(account: ProviderAccount): ProviderImapPreset | null {
  const providerKey = account.provider?.trim().toLowerCase();
  const hostKey = account.smtpHost.trim().toLowerCase();
  return providerKey && providerKey in providerPresets
    ? providerPresets[providerKey]
    : smtpHostPresets[hostKey];
}

export function hasSupportedImapProvider(account: ProviderAccount): boolean {
  return Boolean(resolveImapPreset(account));
}

export function resolveImapSettings(account: EmailAccount): ImapConnectionSettings | null {
  // Prefer explicitly configured IMAP settings; fall back to provider preset.
  const preset = resolveImapPreset(account);
  const host = account.imapHost || preset?.host;
  if (!host) return null;

  const port = account.imapPort || preset?.port || 993;
  const secure = account.imapSecurity
    ? account.imapSecurity !== 'none'
    : (preset?.secure ?? true);
  const alternatePorts = preset?.alternatePorts;
  const loginMethod = preset?.loginMethod;

  const username = account.imapUsername || account.smtpUsername || account.fromEmail;
  const password = account.imapPassword || account.smtpPassword;
  if (!username || !password) return null;

  return {
    host,
    port,
    secure,
    ...(alternatePorts ? { alternatePorts } : {}),
    ...(loginMethod ? { loginMethod } : {}),
    username,
    password,
  };
}
