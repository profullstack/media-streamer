import { createServerClient } from '@/lib/supabase';
import type {
  OpmlFeedOutline,
  ParsedRssFeed,
  ParsedRssItem,
  RssFeed,
  RssItem,
  RssBulkReadStateInput,
  RssFolderSummary,
  RssItemStateInput,
  RssItemWithState,
  RssListOptions,
  RssSubscription,
  RssSubscriptionListOptions,
  RssSubscriptionPage,
  RssSubscriptionSummary,
  RssSubscriptionUpdate,
} from './types';

const FEEDS_TABLE = 'rss_feeds';
const ITEMS_TABLE = 'rss_feed_items';
const SUBSCRIPTIONS_TABLE = 'rss_subscriptions';
const STATES_TABLE = 'rss_item_states';

/**
 * Articles kept per feed. A reader with 47k subscriptions has no use for a
 * feed's full archive, and an unbounded archive per feed is what turns
 * rss_feed_items into a table nobody can query.
 */
export const MAX_ITEMS_PER_FEED = 100;
const MAX_PAGE_SIZE = 100;
const MAX_SUBSCRIPTION_PAGE_SIZE = 500;

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

interface OpmlImportRpcClient {
  rpc(
    fn: 'rss_import_opml_feeds',
    params: { p_profile_id: string; p_feeds: OpmlFeedRecord[] }
  ): Promise<{ data: number | null; error: { message: string } | null }>;
}

interface OpmlFeedRecord {
  feed_url: string;
  site_url: string | null;
  title: string | null;
  folder: string | null;
}

interface ItemWithStateRow extends ItemRow {
  feed_title: string;
  feed_url: string;
  feed_site_url: string | null;
  feed_image_url: string | null;
  is_read: boolean;
  is_saved: boolean;
  read_at: string | null;
  saved_at: string | null;
}

interface SubscriptionPageRow {
  id: string;
  feed_id: string;
  custom_title: string | null;
  folder: string | null;
  notify_new_items: boolean;
  created_at: string;
  updated_at: string;
  feed_title: string;
  feed_url: string;
  feed_site_url: string | null;
  feed_image_url: string | null;
  feed_last_fetched_at: string | null;
  feed_last_fetch_error: string | null;
  total_count: number;
}

interface FolderRow {
  folder: string;
  feed_count: number;
}

interface ReaderRpcClient {
  rpc(
    fn: 'rss_list_items',
    params: {
      p_profile_id: string;
      p_feed_id: string | null;
      p_unread_only: boolean;
      p_saved_only: boolean;
      p_limit: number;
      p_offset: number;
      p_per_feed_limit: number;
    }
  ): Promise<{ data: ItemWithStateRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'rss_list_subscriptions',
    params: { p_profile_id: string; p_search: string | null; p_limit: number; p_offset: number }
  ): Promise<{ data: SubscriptionPageRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'rss_list_folders',
    params: { p_profile_id: string }
  ): Promise<{ data: FolderRow[] | null; error: { message: string } | null }>;
  rpc(
    fn: 'rss_prune_feed_items',
    params: { p_feed_id: string; p_keep: number }
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

function publishedTime(item: ParsedRssItem): number {
  const parsed = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Drops repeat guids, keeping the first copy seen. A feed that reuses a guid —
 * or that has no guid and no link, so several entries collapse onto the same
 * title:date fallback — would otherwise send Postgres two rows with the same
 * (feed_id, guid) in one statement, which fails with "ON CONFLICT DO UPDATE
 * command cannot affect row a second time".
 */
function dedupeByGuid(items: ParsedRssItem[]): ParsedRssItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.guid)) return false;
    seen.add(item.guid);
    return true;
  });
}

/**
 * Stores a feed's newest MAX_ITEMS_PER_FEED articles and prunes whatever the
 * feed has accumulated past that. Saved articles are never pruned — the delete
 * would cascade to rss_item_states and take the bookmark with it.
 */
export async function upsertFeedItems(feedId: string, items: ParsedRssItem[]): Promise<RssItem[]> {
  if (items.length === 0) return [];

  // Dedupe before the slice so a feed full of repeats still stores
  // MAX_ITEMS_PER_FEED distinct articles.
  const newest = dedupeByGuid([...items].sort((a, b) => publishedTime(b) - publishedTime(a))).slice(
    0,
    MAX_ITEMS_PER_FEED
  );

  const { data, error } = await db()
    .from(ITEMS_TABLE)
    .upsert(newest.map((item) => itemInsert(feedId, item)), { onConflict: 'feed_id,guid' })
    .select('*');

  if (error) {
    throw new Error(`Failed to upsert RSS items: ${error.message}`);
  }

  await pruneFeedItems(feedId);

  return ((data ?? []) as ItemRow[]).map(rowToItem);
}

export async function pruneFeedItems(feedId: string, keep = MAX_ITEMS_PER_FEED): Promise<number> {
  const rpcClient = db() as unknown as ReaderRpcClient;
  const { data, error } = await rpcClient.rpc('rss_prune_feed_items', {
    p_feed_id: feedId,
    p_keep: keep,
  });

  if (error) {
    throw new Error(`Failed to prune RSS items: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
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

/**
 * Subscribe a profile to every outline in one batch, creating feed rows for the
 * ones we have never seen. Feeds land without fetch state; items arrive when
 * the feed is first refreshed.
 */
export async function bulkSubscribeToOpmlFeeds(
  profileId: string,
  outlines: OpmlFeedOutline[]
): Promise<number> {
  if (outlines.length === 0) return 0;

  const rpcClient = db() as unknown as OpmlImportRpcClient;
  const { data, error } = await rpcClient.rpc('rss_import_opml_feeds', {
    p_profile_id: profileId,
    p_feeds: outlines.map((outline) => ({
      feed_url: outline.feedUrl,
      site_url: outline.siteUrl,
      title: outline.title,
      folder: outline.folder,
    })),
  });

  if (error) {
    throw new Error(`Failed to import OPML feeds: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
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

/**
 * Reads a page of articles across the profile's subscriptions.
 *
 * The subscription join, the unread/saved filters and the per-feed cap all live
 * in rss_list_items(). Sending the feed ids from here meant a ~1.8 MB request
 * URL for a 47k-feed profile, which the API gateway rejected outright, and
 * filtering after LIMIT meant "unread only" returned a near-empty page.
 */
export async function listItems(profileId: string, options: RssListOptions = {}): Promise<RssItemWithState[]> {
  const rpcClient = db() as unknown as ReaderRpcClient;
  const { data, error } = await rpcClient.rpc('rss_list_items', {
    p_profile_id: profileId,
    p_feed_id: options.feedId ?? null,
    p_unread_only: options.unreadOnly ?? false,
    p_saved_only: options.savedOnly ?? false,
    p_limit: Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE_SIZE),
    p_offset: Math.max(options.offset ?? 0, 0),
    p_per_feed_limit: Math.min(Math.max(options.perFeedLimit ?? MAX_ITEMS_PER_FEED, 1), MAX_ITEMS_PER_FEED),
  });

  if (error) throw new Error(`Failed to list RSS items: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...rowToItem(row),
    feed: {
      id: row.feed_id,
      title: row.feed_title,
      feedUrl: row.feed_url,
      siteUrl: row.feed_site_url,
      imageUrl: row.feed_image_url,
    },
    isRead: row.is_read,
    isSaved: row.is_saved,
    readAt: row.read_at,
    savedAt: row.saved_at,
  }));
}

/** A searchable slice of the sidebar, plus the total it was taken from. */
export async function listSubscriptionPage(
  profileId: string,
  options: RssSubscriptionListOptions = {}
): Promise<RssSubscriptionPage> {
  const search = options.search?.trim();
  const rpcClient = db() as unknown as ReaderRpcClient;
  const { data, error } = await rpcClient.rpc('rss_list_subscriptions', {
    p_profile_id: profileId,
    p_search: search ? search : null,
    p_limit: Math.min(Math.max(options.limit ?? 200, 1), MAX_SUBSCRIPTION_PAGE_SIZE),
    p_offset: Math.max(options.offset ?? 0, 0),
  });

  if (error) throw new Error(`Failed to list RSS subscriptions: ${error.message}`);

  const rows = data ?? [];
  const subscriptions: RssSubscriptionSummary[] = rows.map((row) => ({
    id: row.id,
    feedId: row.feed_id,
    customTitle: row.custom_title,
    folder: row.folder,
    notifyNewItems: row.notify_new_items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feed: {
      id: row.feed_id,
      title: row.feed_title,
      feedUrl: row.feed_url,
      siteUrl: row.feed_site_url,
      imageUrl: row.feed_image_url,
      lastFetchedAt: row.feed_last_fetched_at,
      lastFetchError: row.feed_last_fetch_error,
    },
  }));

  // total_count is a window count, so every row carries the same value and an
  // empty page legitimately means zero matches.
  return { subscriptions, total: rows[0] ? Number(rows[0].total_count) : 0 };
}

export async function listFolders(profileId: string): Promise<RssFolderSummary[]> {
  const rpcClient = db() as unknown as ReaderRpcClient;
  const { data, error } = await rpcClient.rpc('rss_list_folders', { p_profile_id: profileId });

  if (error) throw new Error(`Failed to list RSS folders: ${error.message}`);

  return (data ?? []).map((row) => ({ folder: row.folder, feedCount: Number(row.feed_count) }));
}

/**
 * Feeds this profile subscribes to that have never been fetched, oldest
 * subscription first, so the lazy backfill works through a large import in
 * subscription order instead of restarting on the same feeds every load.
 */
export async function listUnfetchedSubscribedFeedIds(profileId: string, limit: number): Promise<string[]> {
  const { data, error } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .select('feed_id, rss_feeds!inner(last_fetched_at)')
    .eq('profile_id', profileId)
    .eq('is_active', true)
    .is('rss_feeds.last_fetched_at', null)
    .order('created_at', { ascending: true })
    .limit(Math.max(limit, 1));

  if (error) throw new Error(`Failed to list unfetched RSS feeds: ${error.message}`);

  return ((data ?? []) as unknown as Array<{ feed_id: string }>).map((row) => row.feed_id);
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
