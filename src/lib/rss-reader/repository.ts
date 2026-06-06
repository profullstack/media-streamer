import { createServerClient } from '@/lib/supabase';
import type {
  ParsedRssFeed,
  ParsedRssItem,
  RssFeed,
  RssItem,
  RssBulkReadStateInput,
  RssItemStateInput,
  RssItemWithState,
  RssListOptions,
  RssSubscription,
  RssSubscriptionUpdate,
} from './types';

const FEEDS_TABLE = 'rss_feeds';
const ITEMS_TABLE = 'rss_feed_items';
const SUBSCRIPTIONS_TABLE = 'rss_subscriptions';
const STATES_TABLE = 'rss_item_states';

interface FeedRow {
  id: string;
  feed_url: string;
  site_url: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  language: string | null;
  last_fetched_at: string | null;
  last_successful_fetch_at: string | null;
  last_fetch_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  feed_id: string;
  guid: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  enclosure_url: string | null;
  enclosure_type: string | null;
  published_at: string | null;
  source_updated_at: string | null;
  created_at: string;
}

interface StateRow {
  item_id: string;
  is_read: boolean;
  is_saved: boolean;
  read_at: string | null;
  saved_at: string | null;
}

interface SubscriptionWithFeedRow {
  id: string;
  profile_id: string;
  feed_id: string;
  custom_title: string | null;
  folder: string | null;
  notify_new_items: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rss_feeds: FeedRow;
}

interface BulkReadStateRpcClient {
  rpc(
    fn: 'rss_mark_items_read_state',
    params: { p_profile_id: string; p_feed_id: string | null; p_is_read: boolean }
  ): Promise<{ data: number | null; error: { message: string } | null }>;
}

function db() {
  return createServerClient();
}

function rowToFeed(row: FeedRow): RssFeed {
  return {
    id: row.id,
    feedUrl: row.feed_url,
    siteUrl: row.site_url,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    language: row.language,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessfulFetchAt: row.last_successful_fetch_at,
    lastFetchError: row.last_fetch_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToItem(row: ItemRow): RssItem {
  return {
    id: row.id,
    feedId: row.feed_id,
    guid: row.guid,
    title: row.title,
    link: row.link,
    author: row.author,
    summary: row.summary,
    content: row.content,
    imageUrl: row.image_url,
    enclosureUrl: row.enclosure_url,
    enclosureType: row.enclosure_type,
    publishedAt: row.published_at,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
  };
}

function itemInsert(feedId: string, item: ParsedRssItem) {
  return {
    feed_id: feedId,
    guid: item.guid,
    title: item.title,
    link: item.link,
    author: item.author,
    summary: item.summary,
    content: item.content,
    image_url: item.imageUrl,
    enclosure_url: item.enclosureUrl,
    enclosure_type: item.enclosureType,
    published_at: item.publishedAt,
    source_updated_at: item.sourceUpdatedAt,
  };
}

export async function upsertFeed(parsed: ParsedRssFeed): Promise<RssFeed> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from(FEEDS_TABLE)
    .upsert(
      {
        feed_url: parsed.feedUrl,
        site_url: parsed.siteUrl,
        title: parsed.title,
        description: parsed.description,
        image_url: parsed.imageUrl,
        language: parsed.language,
        last_fetched_at: now,
        last_successful_fetch_at: now,
        last_fetch_error: null,
      },
      { onConflict: 'feed_url' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert RSS feed: ${error?.message ?? 'no data'}`);
  }

  return rowToFeed(data as FeedRow);
}

export async function markFeedFetchError(feedId: string, errorMessage: string): Promise<void> {
  const { error } = await db()
    .from(FEEDS_TABLE)
    .update({
      last_fetched_at: new Date().toISOString(),
      last_fetch_error: errorMessage.slice(0, 1000),
    })
    .eq('id', feedId);

  if (error) {
    throw new Error(`Failed to store RSS fetch error: ${error.message}`);
  }
}

export async function getFeedById(feedId: string): Promise<RssFeed | null> {
  const { data, error } = await db()
    .from(FEEDS_TABLE)
    .select('*')
    .eq('id', feedId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get RSS feed: ${error.message}`);
  return data ? rowToFeed(data as FeedRow) : null;
}

export async function upsertFeedItems(feedId: string, items: ParsedRssItem[]): Promise<RssItem[]> {
  if (items.length === 0) return [];

  const { data, error } = await db()
    .from(ITEMS_TABLE)
    .upsert(items.map((item) => itemInsert(feedId, item)), { onConflict: 'feed_id,guid' })
    .select('*');

  if (error) {
    throw new Error(`Failed to upsert RSS items: ${error.message}`);
  }

  return ((data ?? []) as ItemRow[]).map(rowToItem);
}

export async function subscribeToFeed(
  profileId: string,
  feedId: string,
  notifyNewItems: boolean,
  customTitle?: string | null,
  folder?: string | null
): Promise<RssSubscription> {
  const { data, error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .upsert(
      {
        profile_id: profileId,
        feed_id: feedId,
        custom_title: customTitle ?? null,
        folder: folder ?? null,
        notify_new_items: notifyNewItems,
        is_active: true,
      },
      { onConflict: 'profile_id,feed_id' }
    )
    .select('*, rss_feeds(*)')
    .single();

  if (error || !data) {
    throw new Error(`Failed to subscribe to RSS feed: ${error?.message ?? 'no data'}`);
  }

  const row = data as unknown as SubscriptionWithFeedRow;
  return {
    id: row.id,
    profileId: row.profile_id,
    feedId: row.feed_id,
    customTitle: row.custom_title,
    folder: row.folder,
    notifyNewItems: row.notify_new_items,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feed: rowToFeed(row.rss_feeds as FeedRow),
  };
}

export async function listSubscriptions(profileId: string): Promise<RssSubscription[]> {
  const { data, error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .select('*, rss_feeds(*)')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list RSS subscriptions: ${error.message}`);

  return ((data ?? []) as unknown as SubscriptionWithFeedRow[]).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    feedId: row.feed_id,
    customTitle: row.custom_title,
    folder: row.folder,
    notifyNewItems: row.notify_new_items,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feed: rowToFeed(row.rss_feeds as FeedRow),
  }));
}

export async function updateSubscription(
  profileId: string,
  feedId: string,
  input: RssSubscriptionUpdate
): Promise<RssSubscription> {
  const update: Record<string, unknown> = {};
  if (input.customTitle !== undefined) update.custom_title = input.customTitle;
  if (input.folder !== undefined) update.folder = input.folder;
  if (input.notifyNewItems !== undefined) update.notify_new_items = input.notifyNewItems;
  if (input.isActive !== undefined) update.is_active = input.isActive;

  const { data, error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .update(update)
    .eq('profile_id', profileId)
    .eq('feed_id', feedId)
    .select('*, rss_feeds(*)')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update RSS subscription: ${error?.message ?? 'no data'}`);
  }

  const row = data as unknown as SubscriptionWithFeedRow;
  return {
    id: row.id,
    profileId: row.profile_id,
    feedId: row.feed_id,
    customTitle: row.custom_title,
    folder: row.folder,
    notifyNewItems: row.notify_new_items,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feed: rowToFeed(row.rss_feeds as FeedRow),
  };
}

export async function deleteSubscription(profileId: string, feedId: string): Promise<void> {
  const { error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .delete()
    .eq('profile_id', profileId)
    .eq('feed_id', feedId);

  if (error) throw new Error(`Failed to delete RSS subscription: ${error.message}`);
}

export async function hasActiveSubscription(profileId: string, feedId: string): Promise<boolean> {
  const { data, error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .select('id')
    .eq('profile_id', profileId)
    .eq('feed_id', feedId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Failed to check RSS subscription: ${error.message}`);
  return Boolean(data);
}

export async function listItems(profileId: string, options: RssListOptions = {}): Promise<RssItemWithState[]> {
  const subscriptions = await listSubscriptions(profileId);
  let feedIds = subscriptions.map((subscription) => subscription.feedId);

  if (options.feedId) {
    feedIds = feedIds.filter((feedId) => feedId === options.feedId);
  }

  if (feedIds.length === 0) return [];

  const feedById = new Map(subscriptions.map((subscription) => [subscription.feedId, subscription.feed]));
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const { data: itemRows, error: itemError } = await db()
    .from(ITEMS_TABLE)
    .select('*')
    .in('feed_id', feedIds)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (itemError) throw new Error(`Failed to list RSS items: ${itemError.message}`);

  const rows = (itemRows ?? []) as ItemRow[];
  if (rows.length === 0) return [];

  const { data: stateRows, error: stateError } = await db()
    .from(STATES_TABLE)
    .select('item_id,is_read,is_saved,read_at,saved_at')
    .eq('profile_id', profileId)
    .in('item_id', rows.map((row) => row.id));

  if (stateError) throw new Error(`Failed to list RSS item states: ${stateError.message}`);

  const stateByItem = new Map<string, StateRow>(
    ((stateRows ?? []) as StateRow[]).map((row) => [row.item_id, row])
  );

  return rows
    .map((row) => {
      const state = stateByItem.get(row.id);
      const feed = feedById.get(row.feed_id);
      if (!feed) return null;

      return {
        ...rowToItem(row),
        feed: {
          id: feed.id,
          title: feed.title,
          feedUrl: feed.feedUrl,
          siteUrl: feed.siteUrl,
          imageUrl: feed.imageUrl,
        },
        isRead: state?.is_read ?? false,
        isSaved: state?.is_saved ?? false,
        readAt: state?.read_at ?? null,
        savedAt: state?.saved_at ?? null,
      };
    })
    .filter((item): item is RssItemWithState => {
      if (!item) return false;
      if (options.unreadOnly && item.isRead) return false;
      if (options.savedOnly && !item.isSaved) return false;
      return true;
    });
}

export async function updateItemState(
  profileId: string,
  itemId: string,
  input: RssItemStateInput
): Promise<StateRow> {
  const now = new Date().toISOString();
  const update = {
    profile_id: profileId,
    item_id: itemId,
    ...(input.isRead !== undefined
      ? { is_read: input.isRead, read_at: input.isRead ? now : null }
      : {}),
    ...(input.isSaved !== undefined
      ? { is_saved: input.isSaved, saved_at: input.isSaved ? now : null }
      : {}),
  };

  const { data, error } = await db()
    .from(STATES_TABLE)
    .upsert(update, { onConflict: 'profile_id,item_id' })
    .select('item_id,is_read,is_saved,read_at,saved_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update RSS item state: ${error?.message ?? 'no data'}`);
  }

  return data as StateRow;
}

export async function updateItemsReadState(
  profileId: string,
  input: RssBulkReadStateInput
): Promise<{ updatedCount: number }> {
  const rpcClient = db() as unknown as BulkReadStateRpcClient;
  const { data, error } = await rpcClient.rpc('rss_mark_items_read_state', {
    p_profile_id: profileId,
    p_feed_id: input.feedId ?? null,
    p_is_read: input.isRead,
  });

  if (error) {
    throw new Error(`Failed to update RSS item read state: ${error.message}`);
  }

  return { updatedCount: typeof data === 'number' ? data : 0 };
}
