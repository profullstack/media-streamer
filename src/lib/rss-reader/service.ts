import { parseFeedXml, parseOpmlXml } from './parser';
import {
  deleteSubscription,
  getFeedById,
  hasActiveSubscription,
  listItems,
  listSubscriptions,
  markFeedFetchError,
  subscribeToFeed as saveSubscription,
  updateItemState,
  updateSubscription,
  upsertFeed,
  upsertFeedItems,
} from './repository';
import type { OpmlFeedOutline, RssItemStateInput, RssListOptions, RssSubscriptionUpdate } from './types';

const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 15_000;

function normalizeFeedUrl(feedUrl: string): string {
  const url = new URL(feedUrl.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Feed URL must use HTTP or HTTPS');
  }
  return url.toString();
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

export async function subscribeToRssFeed(
  profileId: string,
  feedUrl: string,
  notifyNewItems = false,
  options: { customTitle?: string | null; folder?: string | null } = {}
) {
  const normalizedUrl = normalizeFeedUrl(feedUrl);
  const xml = await fetchFeedXml(normalizedUrl);
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
    const xml = await fetchFeedXml(feed.feedUrl);
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
