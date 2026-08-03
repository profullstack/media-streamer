/**
 * Reader query tests.
 *
 * These cover the shape a 47k-feed subscription list forced: the article query
 * must not carry feed ids in the request (the URL was ~1.8 MB and the gateway
 * rejected it), and a feed's stored archive is capped so the table stays
 * queryable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedRssItem } from './types';

const rpc = vi.fn();
const upsert = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ rpc, from }),
}));

const { listItems, listSubscriptionPage, upsertFeedItems, MAX_ITEMS_PER_FEED } =
  await import('./repository');

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    feed_id: 'feed-1',
    guid: 'guid-1',
    title: 'Article',
    link: 'https://example.com/a',
    author: null,
    summary: null,
    content: null,
    image_url: null,
    enclosure_url: null,
    enclosure_type: null,
    published_at: '2026-08-01T00:00:00.000Z',
    source_updated_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    feed_title: 'Example Feed',
    feed_url: 'https://example.com/rss',
    feed_site_url: 'https://example.com',
    feed_image_url: null,
    is_read: false,
    is_saved: false,
    read_at: null,
    saved_at: null,
    ...overrides,
  };
}

function parsedItem(index: number, publishedAt: string | null): ParsedRssItem {
  return {
    guid: `guid-${index}`,
    title: `Article ${index}`,
    link: `https://example.com/${index}`,
    author: null,
    summary: null,
    content: null,
    imageUrl: null,
    enclosureUrl: null,
    enclosureType: null,
    publishedAt,
    sourceUpdatedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
  upsert.mockReturnValue({ select: () => Promise.resolve({ data: [], error: null }) });
  from.mockReturnValue({ upsert });
});

describe('listItems', () => {
  it('reads through the RPC instead of sending every subscribed feed id', async () => {
    rpc.mockResolvedValueOnce({ data: [itemRow()], error: null });

    const items = await listItems('profile-1', { unreadOnly: true });

    expect(rpc).toHaveBeenCalledWith('rss_list_items', {
      p_profile_id: 'profile-1',
      p_feed_id: null,
      p_unread_only: true,
      p_saved_only: false,
      p_limit: 50,
      p_offset: 0,
      p_per_feed_limit: MAX_ITEMS_PER_FEED,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'item-1',
      isRead: false,
      feed: { id: 'feed-1', title: 'Example Feed', siteUrl: 'https://example.com' },
    });
  });

  it('clamps the page size and the per-feed cap', async () => {
    await listItems('profile-1', { limit: 5000, offset: -3, perFeedLimit: 9999 });

    expect(rpc).toHaveBeenCalledWith(
      'rss_list_items',
      expect.objectContaining({ p_limit: 100, p_offset: 0, p_per_feed_limit: MAX_ITEMS_PER_FEED })
    );
  });

  it('surfaces RPC failures', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(listItems('profile-1')).rejects.toThrow('Failed to list RSS items: boom');
  });
});

describe('listSubscriptionPage', () => {
  it('returns the window count as the total, not the page length', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-1',
          feed_id: 'feed-1',
          custom_title: null,
          folder: 'Tech',
          notify_new_items: false,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
          feed_title: 'Example Feed',
          feed_url: 'https://example.com/rss',
          feed_site_url: null,
          feed_image_url: null,
          feed_last_fetched_at: null,
          feed_last_fetch_error: null,
          total_count: 47246,
        },
      ],
      error: null,
    });

    const page = await listSubscriptionPage('profile-1', { search: '  news  ' });

    expect(rpc).toHaveBeenCalledWith('rss_list_subscriptions', {
      p_profile_id: 'profile-1',
      p_search: 'news',
      p_limit: 200,
      p_offset: 0,
    });
    expect(page.total).toBe(47246);
    expect(page.subscriptions).toHaveLength(1);
  });

  it('reports zero for an empty page', async () => {
    const page = await listSubscriptionPage('profile-1');

    expect(page).toEqual({ subscriptions: [], total: 0 });
  });
});

describe('upsertFeedItems', () => {
  it('stores only the newest MAX_ITEMS_PER_FEED articles, then prunes the rest', async () => {
    const items = Array.from({ length: 150 }, (_, index) =>
      parsedItem(index, new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString())
    );

    await upsertFeedItems('feed-1', items);

    const written = upsert.mock.calls[0][0] as Array<{ guid: string }>;
    expect(written).toHaveLength(MAX_ITEMS_PER_FEED);
    // Newest first: index 149 has the latest published_at.
    expect(written[0].guid).toBe('guid-149');
    expect(written.at(-1)?.guid).toBe('guid-50');

    expect(rpc).toHaveBeenCalledWith('rss_prune_feed_items', {
      p_feed_id: 'feed-1',
      p_keep: MAX_ITEMS_PER_FEED,
    });
  });

  it('sorts undated articles last rather than dropping the dated ones', async () => {
    const items = [parsedItem(0, null), parsedItem(1, '2026-08-01T00:00:00.000Z')];

    await upsertFeedItems('feed-1', items);

    const written = upsert.mock.calls[0][0] as Array<{ guid: string }>;
    expect(written.map((row) => row.guid)).toEqual(['guid-1', 'guid-0']);
  });

  it('does nothing when the feed has no articles', async () => {
    await upsertFeedItems('feed-1', []);

    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
