import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject, ParsedMail } from 'mailparser';
import type { EmailAccount } from '@/lib/email-accounts';
import { resolveImapSettings } from './providers';
import type { EmailMessage, EmailMessageSummary, ImapConnectionSettings, MailboxAccount } from './types';

const DEFAULT_MAILBOX = 'INBOX';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function formatAddress(addresses: AddressObject | undefined): string {
  return addresses?.value.map((item) => item.name ? `${item.name} <${item.address ?? ''}>` : item.address ?? '').filter(Boolean).join(', ') ?? '';
}

function firstEmailAddress(addresses: AddressObject | undefined): string | null {
  return addresses?.value.find((item) => item.address)?.address ?? null;
}

function formatAddressList(addresses: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];
  return list.flatMap((address) => address.value.map((item) => item.name ? `${item.name} <${item.address ?? ''}>` : item.address ?? '').filter(Boolean));
}

function normalizeSubject(subject: string | false | undefined): string {
  return typeof subject === 'string' && subject.trim() ? subject.trim() : '(no subject)';
}

function toIsoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeParsedMail(parsed: ParsedMail, uid: number, flags: Set<string>, fallbackDate?: Date | string): EmailMessage {
  return {
    uid,
    subject: normalizeSubject(parsed.subject),
    from: formatAddress(parsed.from),
    fromEmail: firstEmailAddress(parsed.from),
    to: formatAddressList(parsed.to),
    date: toIsoDate(parsed.date ?? fallbackDate),
    isRead: flags.has('\\Seen'),
    replyTo: formatAddressList(parsed.replyTo).length > 0 ? formatAddressList(parsed.replyTo) : formatAddressList(parsed.from),
    messageId: parsed.messageId ?? null,
    references: Array.isArray(parsed.references)
      ? parsed.references
      : typeof parsed.references === 'string'
        ? [parsed.references]
        : [],
    text: parsed.text?.trim() ?? '',
    html: typeof parsed.html === 'string' ? parsed.html : null,
  };
}

function createClient(settings: ImapConnectionSettings): ImapFlow {
  return new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    logger: false,
  });
}

async function withMailbox<T>(
  settings: ImapConnectionSettings,
  callback: (client: ImapFlow) => Promise<T>,
  mailbox = DEFAULT_MAILBOX
): Promise<T> {
  const client = createClient(settings);
  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  try {
    return await callback(client);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

export function toMailboxAccount(account: EmailAccount): MailboxAccount {
  return {
    account,
    imap: resolveImapSettings(account),
  };
}

export async function listInboxMessages(
  account: EmailAccount,
  options: { limit?: number; mailbox?: string } = {}
): Promise<EmailMessageSummary[]> {
  const settings = resolveImapSettings(account);
  if (!settings) {
    throw new Error('This email account does not have supported IMAP settings yet');
  }

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return withMailbox(settings, async (client) => {
    const status = await client.status(DEFAULT_MAILBOX, { messages: true });
    const total = status.messages ?? 0;
    if (total === 0) return [];

    const start = Math.max(1, total - limit + 1);
    const messages: EmailMessageSummary[] = [];

    for await (const message of client.fetch(`${start}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
    })) {
      messages.push({
        uid: message.uid,
        subject: normalizeSubject(message.envelope?.subject),
        from: message.envelope?.from?.map((address) => address.name ? `${address.name} <${address.address}>` : address.address).filter(isString).join(', ') ?? '',
        fromEmail: message.envelope?.from?.find((address) => address.address)?.address ?? null,
        to: message.envelope?.to?.map((address) => address.name ? `${address.name} <${address.address}>` : address.address).filter(isString) ?? [],
        date: toIsoDate(message.envelope?.date ?? message.internalDate),
        isRead: message.flags?.has('\\Seen') ?? false,
      });
    }

    return messages.sort((a, b) => b.uid - a.uid);
  }, options.mailbox);
}

export async function checkImapAccount(account: EmailAccount): Promise<void> {
  const settings = resolveImapSettings(account);
  if (!settings) {
    return;
  }

  await withMailbox(settings, async (client) => {
    await client.status(DEFAULT_MAILBOX, { messages: true });
  });
}

export async function getInboxMessage(
  account: EmailAccount,
  uid: number,
  options: { mailbox?: string; markSeen?: boolean } = {}
): Promise<EmailMessage | null> {
  const settings = resolveImapSettings(account);
  if (!settings) {
    throw new Error('This email account does not have supported IMAP settings yet');
  }

  return withMailbox(settings, async (client) => {
    const message = await client.fetchOne(uid, {
      uid: true,
      source: true,
      flags: true,
      internalDate: true,
    }, { uid: true });

    if (!message || !message.source) return null;
    const flags = message.flags ?? new Set<string>();
    if (options.markSeen !== false && !flags.has('\\Seen')) {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }

    const parsed = await simpleParser(message.source);
    return normalizeParsedMail(parsed, message.uid, flags, message.internalDate);
  }, options.mailbox);
}
