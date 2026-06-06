import { parseFeedXml, parseOpmlXml } from './parser';
import { getEmailAccount } from '@/lib/email-accounts';
import { buildPrivateSenderFeedXml, extractEmailAddress } from '@/lib/email-reader';
import { createServerClient } from '@/lib/supabase';
import { isPaidSubscriptionActive } from '@/lib/subscription/check';
import {
  deleteSubscription,
  getFeedById,
  hasActiveSubscription,
  listItems,
  listSubscriptions,
  markFeedFetchError,
  subscribeToFeed as saveSubscription,
  updateItemState,
  updateItemsReadState,
  updateSubscription,
  upsertFeed,
  upsertFeedItems,
} from './repository';
import type { OpmlFeedOutline, RssItemStateInput, RssListOptions, RssSubscriptionUpdate } from './types';

const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 15_000;

interface PrivateSenderFeedParams {
  origin: string;
  profileId: string;
  accountId: string;
  senderEmail: string;
}

interface ProfileOwnerRow {
  account_id: string | null;
}

interface ProfileOwnerClient {
  from(table: 'profiles'): {
    select(columns: 'account_id'): {
      eq(column: 'id', value: string): {
        maybeSingle(): Promise<{
          data: ProfileOwnerRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

function normalizeFeedUrl(feedUrl: string): string {
  const url = new URL(feedUrl.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Feed URL must use HTTP or HTTPS');
  }
  return url.toString();
}

function getPrivateSenderFeedParams(feedUrl: string): PrivateSenderFeedParams | null {
  const url = new URL(feedUrl);
  if (url.pathname !== '/api/email/sender-feed') return null;

  const profileId = url.searchParams.get('profileId');
  const accountId = url.searchParams.get('accountId');
  const senderEmail = extractEmailAddress(url.searchParams.get('sender'));
  if (!profileId || !accountId || !senderEmail) return null;

  return {
    origin: url.origin,
    profileId,
    accountId,
    senderEmail,
  };
}

async function getProfileOwnerId(profileId: string): Promise<string | null> {
  const profileClient = createServerClient() as unknown as ProfileOwnerClient;
  const { data, error } = await profileClient
    .from('profiles')
    .select('account_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve RSS feed profile: ${error.message}`);
  }

  return typeof data?.account_id === 'string' ? data.account_id : null;
}

async function renderPrivateSenderFeed(profileId: string, feedUrl: string): Promise<string | null> {
  const params = getPrivateSenderFeedParams(feedUrl);
  if (!params) return null;
  if (params.profileId !== profileId) {
    throw new Error('Private email feed belongs to another profile');
  }

  const ownerId = await getProfileOwnerId(profileId);
  if (!ownerId) {
    throw new Error('Private email feed profile not found');
  }

  const paid = await isPaidSubscriptionActive(ownerId);
  if (!paid.active) {
    throw new Error('Paid subscription required');
  }

  const account = await getEmailAccount(ownerId, params.accountId);
  if (!account) {
    throw new Error('Email account not found');
  }

  return buildPrivateSenderFeedXml(params.origin, account, profileId, params.senderEmail);
}

async function fetchFeedXml(feedUrl: string): Promise<string> {
  const response = await fetch(feedUrl, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': 'BitTorrented RSS Reader/1.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed returned HTTP ${response.status}`);
  }

  const xml = await response.text();
  if (xml.length > MAX_FEED_BYTES) {
    throw new Error('Feed is too large');
  }
  return xml;
}

async function loadFeedXml(profileId: string, feedUrl: string): Promise<string> {
  const privateSenderXml = await renderPrivateSenderFeed(profileId, feedUrl);
  if (privateSenderXml) return privateSenderXml;
  return fetchFeedXml(feedUrl);
}

export async function subscribeToRssFeed(
  profileId: string,
  feedUrl: string,
  notifyNewItems = false,
  options: { customTitle?: string | null; folder?: string | null } = {}
) {
  const normalizedUrl = normalizeFeedUrl(feedUrl);
  const xml = await loadFeedXml(profileId, normalizedUrl);
  const parsed = parseFeedXml(xml, normalizedUrl);
  if (!parsed) {
    throw new Error('Could not parse RSS or Atom feed');
  }

  const feed = await upsertFeed(parsed);
  await upsertFeedItems(feed.id, parsed.items);
  return saveSubscription(profileId, feed.id, notifyNewItems, options.customTitle, options.folder);
}

export interface OpmlImportResult {
  total: number;
  imported: Array<{ feedUrl: string; feedId: string; title: string; folder: string | null }>;
  failed: Array<{ feedUrl: string; title: string | null; error: string }>;
}

export function parseOpmlFeeds(opml: string): OpmlFeedOutline[] {
  return parseOpmlXml(opml);
}

export async function importOpmlFeeds(profileId: string, opml: string): Promise<OpmlImportResult> {
  const outlines = parseOpmlXml(opml);
  const result: OpmlImportResult = {
    total: outlines.length,
    imported: [],
    failed: [],
  };

  for (const outline of outlines) {
    try {
      const subscription = await subscribeToRssFeed(profileId, outline.feedUrl, false, {
        customTitle: outline.title,
        folder: outline.folder,
      });
      result.imported.push({
        feedUrl: subscription.feed.feedUrl,
        feedId: subscription.feedId,
        title: subscription.customTitle ?? subscription.feed.title,
        folder: subscription.folder,
      });
    } catch (error) {
      result.failed.push({
        feedUrl: outline.feedUrl,
        title: outline.title,
        error: error instanceof Error ? error.message : 'Failed to import feed',
      });
    }
  }

  return result;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function outlineAttributes(attributes: Record<string, string | null | undefined>): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(' ');
}

export async function exportOpmlFeeds(profileId: string): Promise<string> {
  const subscriptions = await listSubscriptions(profileId);
  const exportedAt = new Date().toUTCString();
  const grouped = new Map<string, typeof subscriptions>();
  const ungrouped: typeof subscriptions = [];

  for (const subscription of subscriptions) {
    if (subscription.folder) {
      const current = grouped.get(subscription.folder) ?? [];
      current.push(subscription);
      grouped.set(subscription.folder, current);
    } else {
      ungrouped.push(subscription);
    }
  }

  const renderFeed = (subscription: (typeof subscriptions)[number], indent = '    '): string => {
    const title = subscription.customTitle ?? subscription.feed.title;
    const attributes = outlineAttributes({
      text: title,
      title,
      type: 'rss',
      xmlUrl: subscription.feed.feedUrl,
      htmlUrl: subscription.feed.siteUrl,
    });
    return `${indent}<outline ${attributes}/>`;
  };

  const folderOutlines = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, folderSubscriptions]) => {
      const feeds = folderSubscriptions
        .sort((a, b) => (a.customTitle ?? a.feed.title).localeCompare(b.customTitle ?? b.feed.title))
        .map((subscription) => renderFeed(subscription, '      '))
        .join('\n');
      return `    <outline text="${escapeXml(folder)}" title="${escapeXml(folder)}">\n${feeds}\n    </outline>`;
    });

  const looseFeeds = ungrouped
    .sort((a, b) => (a.customTitle ?? a.feed.title).localeCompare(b.customTitle ?? b.feed.title))
    .map((subscription) => renderFeed(subscription));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>BitTorrented RSS Reader Subscriptions</title>',
    `    <dateCreated>${escapeXml(exportedAt)}</dateCreated>`,
    '  </head>',
    '  <body>',
    ...folderOutlines,
    ...looseFeeds,
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}

export async function refreshRssFeed(profileId: string, feedId: string): Promise<{ itemCount: number }> {
  const allowed = await hasActiveSubscription(profileId, feedId);
  if (!allowed) {
    throw new Error('RSS feed is not subscribed by this profile');
  }

  const feed = await getFeedById(feedId);
  if (!feed) {
    throw new Error('RSS feed not found');
  }

  try {
    const xml = await loadFeedXml(profileId, feed.feedUrl);
    const parsed = parseFeedXml(xml, feed.feedUrl);
    if (!parsed) {
      throw new Error('Could not parse RSS or Atom feed');
    }

    const updatedFeed = await upsertFeed({ ...parsed, feedUrl: feed.feedUrl });
    const items = await upsertFeedItems(updatedFeed.id, parsed.items);
    return { itemCount: items.length };
  } catch (error) {
    await markFeedFetchError(feed.id, error instanceof Error ? error.message : 'Unknown RSS fetch error');
    throw error;
  }
}

export async function getRssReaderData(profileId: string, options: RssListOptions = {}) {
  const [subscriptions, items] = await Promise.all([
    listSubscriptions(profileId),
    listItems(profileId, options),
  ]);

  return { subscriptions, items };
}

export async function removeRssSubscription(profileId: string, feedId: string): Promise<void> {
  await deleteSubscription(profileId, feedId);
}

export async function updateRssSubscription(
  profileId: string,
  feedId: string,
  input: RssSubscriptionUpdate
) {
  return updateSubscription(profileId, feedId, input);
}

export async function setRssItemState(profileId: string, itemId: string, input: RssItemStateInput) {
  return updateItemState(profileId, itemId, input);
}

export async function setRssItemsReadState(
  profileId: string,
  input: { feedId?: string | null; isRead: boolean }
) {
  return updateItemsReadState(profileId, input);
}
