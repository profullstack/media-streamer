import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailAccount } from '@/lib/email-accounts';
import { listInboxMessages, getInboxMessage } from './imap';
import type { EmailMessage } from './types';

const MAX_FEED_MESSAGES = 20;
const SCAN_LIMIT = 50;

export interface PrivateSenderFeedInput {
  userId: string;
  accountId: string;
  senderEmail: string;
}

function secret(): string {
  const value = [
    process.env.ENCRYPTION_KEY,
    process.env.ENCYRPTION_KEY,
    process.env.EMAIL_ACCOUNTS_ENCRYPTION_KEY,
  ].find((candidate) => candidate?.trim());
  if (!value) {
    throw new Error('ENCRYPTION_KEY is required for private email feeds');
  }
  return value;
}

function canonical(input: PrivateSenderFeedInput): string {
  return [input.userId, input.accountId, input.senderEmail.trim().toLowerCase()].join(':');
}

export function extractEmailAddress(value: string | null | undefined): string | null {
  return value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

export function signPrivateSenderFeed(input: PrivateSenderFeedInput): string {
  return createHmac('sha256', secret()).update(canonical(input)).digest('base64url');
}

export function verifyPrivateSenderFeed(input: PrivateSenderFeedInput, token: string): boolean {
  const expected = Buffer.from(signPrivateSenderFeed(input));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildPrivateSenderFeedUrl(origin: string, input: PrivateSenderFeedInput): string {
  const url = new URL('/api/email/sender-feed', origin);
  url.searchParams.set('userId', input.userId);
  url.searchParams.set('accountId', input.accountId);
  url.searchParams.set('sender', input.senderEmail.trim().toLowerCase());
  url.searchParams.set('token', signPrivateSenderFeed(input));
  return url.toString();
}

function escapeXml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function messageUrl(origin: string, accountId: string, uid: number): string {
  const url = new URL('/email', origin);
  url.searchParams.set('accountId', accountId);
  url.searchParams.set('uid', String(uid));
  return url.toString();
}

function renderItem(origin: string, account: EmailAccount, message: EmailMessage): string {
  const link = messageUrl(origin, account.id, message.uid);
  const pubDate = message.date ? new Date(message.date).toUTCString() : new Date().toUTCString();
  const description = stripControlChars(message.text).slice(0, 4000);

  return [
    '    <item>',
    `      <title>${escapeXml(message.subject)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(`email:${account.id}:${message.uid}`)}</guid>`,
    `      <author>${escapeXml(message.fromEmail ?? message.from)}</author>`,
    `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
    `      <description>${escapeXml(description)}</description>`,
    '    </item>',
  ].join('\n');
}

export async function buildPrivateSenderFeedXml(
  origin: string,
  account: EmailAccount,
  senderEmail: string
): Promise<string> {
  const normalizedSender = senderEmail.trim().toLowerCase();
  const summaries = await listInboxMessages(account, { limit: SCAN_LIMIT });
  const matching = summaries
    .filter((message) => (message.fromEmail ?? extractEmailAddress(message.from))?.toLowerCase() === normalizedSender)
    .slice(0, MAX_FEED_MESSAGES);

  const messages: EmailMessage[] = [];
  for (const summary of matching) {
    const message = await getInboxMessage(account, summary.uid, { markSeen: false });
    if (message) messages.push(message);
  }

  const feedTitle = `Email from ${normalizedSender}`;
  const selfUrl = buildPrivateSenderFeedUrl(origin, {
    userId: account.userId,
    accountId: account.id,
    senderEmail: normalizedSender,
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(feedTitle)}</title>`,
    `    <link>${escapeXml(origin.replace(/\/$/, ''))}</link>`,
    `    <description>${escapeXml(`Private feed for messages from ${normalizedSender}`)}</description>`,
    `    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>`,
    `    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...messages.map((message) => renderItem(origin, account, message)),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
