/**
 * OPML import tests.
 *
 * The import path has to survive whole-directory OPML files (Kagi's Small Web
 * list is ~47k feeds), so it subscribes in bulk and only loads articles for as
 * many feeds as fit in a time budget.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpmlFeedOutline } from './types';

const bulkSubscribeToOpmlFeeds = vi.fn();
const upsertFeed = vi.fn();
const upsertFeedItems = vi.fn();

vi.mock('./repository', () => ({
  bulkSubscribeToOpmlFeeds: (...args: unknown[]) => bulkSubscribeToOpmlFeeds(...args),
  upsertFeed: (...args: unknown[]) => upsertFeed(...args),
  upsertFeedItems: (...args: unknown[]) => upsertFeedItems(...args),
  deleteSubscription: vi.fn(),
  getFeedById: vi.fn(),
  hasActiveSubscription: vi.fn(),
  listFolders: vi.fn(),
  listItems: vi.fn(),
  listSubscriptionPage: vi.fn(),
  listSubscriptions: vi.fn(),
  listUnfetchedSubscribedFeedIds: vi.fn(),
  markFeedFetchError: vi.fn(),
  subscribeToFeed: vi.fn(),
  updateItemState: vi.fn(),
  updateItemsReadState: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/email-accounts', () => ({ getEmailAccount: vi.fn() }));
vi.mock('@/lib/email-reader', () => ({
  buildPrivateSenderFeedXml: vi.fn(),
  extractEmailAddress: vi.fn(() => null),
}));
vi.mock('@/lib/subscription/check', () => ({ isPaidSubscriptionActive: vi.fn() }));

const { importOpmlOutlines } = await import('./service');

function feedXml(title: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>
    <item><title>Post</title><link>https://example.com/post</link></item>
  </channel></rss>`;
}

function outlines(count: number, prefix = 'feed'): OpmlFeedOutline[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index}`,
    feedUrl: `https://${prefix}-${index}.example.com/rss`,
    siteUrl: `https://${prefix}-${index}.example.com/`,
    folder: 'Small Web',
  }));
}

describe('importOpmlOutlines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkSubscribeToOpmlFeeds.mockImplementation((_profileId: string, chunk: OpmlFeedOutline[]) =>
      Promise.resolve(chunk.length)
    );
    upsertFeed.mockImplementation(() => Promise.resolve({ id: 'feed-id' }));
    upsertFeedItems.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(feedXml('Example'), { status: 200 })))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subscribes in bulk and reports what it loaded', async () => {
    const result = await importOpmlOutlines('profile-1', outlines(3));

    expect(bulkSubscribeToOpmlFeeds).toHaveBeenCalledTimes(1);
    expect(bulkSubscribeToOpmlFeeds).toHaveBeenCalledWith('profile-1', expect.any(Array));
    expect(result).toMatchObject({ total: 3, imported: 3, fetched: 3, failed: 0 });
    expect(result.errors).toEqual([]);
  });

  it('splits large imports into chunked RPC calls', async () => {
    // 4500 feeds at 2000 per call; skip the network entirely so the test is fast.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const result = await importOpmlOutlines('profile-1', outlines(4500));

    expect(bulkSubscribeToOpmlFeeds).toHaveBeenCalledTimes(3);
    const chunkSizes = bulkSubscribeToOpmlFeeds.mock.calls.map((call) => call[1].length);
    expect(chunkSizes).toEqual([2000, 2000, 500]);
    expect(result.total).toBe(4500);
    expect(result.imported).toBe(4500);
  });

  it('keeps subscriptions when a feed fails to load, and caps reported errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))));

    const result = await importOpmlOutlines('profile-1', outlines(30));

    expect(result.imported).toBe(30);
    expect(result.fetched).toBe(0);
    expect(result.failed).toBe(30);
    expect(result.errors).toHaveLength(20);
    expect(result.errors[0].error).toContain('HTTP 500');
  });

  it('does not fetch when there is nothing to import', async () => {
    const result = await importOpmlOutlines('profile-1', []);

    expect(bulkSubscribeToOpmlFeeds).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, imported: 0, fetched: 0, failed: 0 });
  });
});
