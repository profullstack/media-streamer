/**
 * Search Stats API Tests
 *
 * The number these cover used to be a planner estimate, which drifted ~9% high
 * and then snapped down on ANALYZE, reading as the index losing 400k torrents
 * while it was actually gaining 1.19M. The route now prefers a real cached
 * count, so the cases that matter are: cache wins, stale cache is refused, and
 * a missing cache still degrades to the estimate rather than to zero.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/supabase', () => ({
  getServerClient: vi.fn(),
}));

import { getServerClient } from '@/lib/supabase';

const mockGetServerClient = vi.mocked(getServerClient);

interface CacheRow {
  exact_count: number;
  counted_at: string;
}

/**
 * Build a Supabase client stub covering exactly the three reads the route makes:
 * an exact count on bt_torrents, a row read on bt_torrent_count_cache, and an
 * estimated count on torrents.
 */
function createClient(options: {
  userCount?: number | null;
  userError?: { message: string } | null;
  cacheRow?: CacheRow | null;
  cacheError?: { message: string } | null;
  estimate?: number | null;
  estimateError?: { message: string } | null;
  estimateThrows?: boolean;
}) {
  const {
    userCount = 6017,
    userError = null,
    cacheRow = null,
    cacheError = null,
    estimate = null,
    estimateError = null,
    estimateThrows = false,
  } = options;

  return {
    from(table: string) {
      if (table === 'bt_torrents') {
        return {
          select: () => Promise.resolve({ count: userCount, error: userError }),
        };
      }

      if (table === 'bt_torrent_count_cache') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: cacheRow, error: cacheError }),
            }),
          }),
        };
      }

      if (table === 'torrents') {
        return {
          select: () => {
            if (estimateThrows) throw new Error('relation "torrents" does not exist');
            return Promise.resolve({ count: estimate, error: estimateError });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as ReturnType<typeof getServerClient>;
}

describe('Search Stats API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('prefers the cached exact count over the estimate', async () => {
    mockGetServerClient.mockReturnValue(
      createClient({
        userCount: 6017,
        cacheRow: { exact_count: 18_602_544, counted_at: new Date().toISOString() },
        estimate: 18_621_675,
      })
    );

    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.dhtTorrents).toBe(18_602_544);
    expect(data.totalTorrents).toBe(18_608_561);
    expect(data.dhtCountSource).toBe('cache');
    expect(data.dhtCountedAt).not.toBeNull();
  });

  it('falls back to the estimate when the cache has never been populated', async () => {
    mockGetServerClient.mockReturnValue(
      createClient({ userCount: 6017, cacheRow: null, estimate: 18_621_675 })
    );

    const data = await (await GET()).json();
    expect(data.dhtTorrents).toBe(18_621_675);
    expect(data.dhtCountSource).toBe('estimate');
    expect(data.dhtCountedAt).toBeNull();
  });

  it('refuses a cached count older than a day and uses the estimate instead', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockGetServerClient.mockReturnValue(
      createClient({
        userCount: 6017,
        cacheRow: { exact_count: 17_000_000, counted_at: twoDaysAgo },
        estimate: 18_621_675,
      })
    );

    const data = await (await GET()).json();
    expect(data.dhtTorrents).toBe(18_621_675);
    expect(data.dhtCountSource).toBe('estimate');
    expect(console.warn).toHaveBeenCalled();
  });

  it('keeps a cached count that is just inside the freshness window', async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    mockGetServerClient.mockReturnValue(
      createClient({
        cacheRow: { exact_count: 18_602_544, counted_at: sixHoursAgo },
        estimate: 1,
      })
    );

    const data = await (await GET()).json();
    expect(data.dhtTorrents).toBe(18_602_544);
    expect(data.dhtCountSource).toBe('cache');
  });

  it('falls back to the estimate when the cache read errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetServerClient.mockReturnValue(
      createClient({ cacheError: { message: 'permission denied' }, estimate: 18_621_675 })
    );

    const data = await (await GET()).json();
    expect(data.dhtTorrents).toBe(18_621_675);
    expect(data.dhtCountSource).toBe('estimate');
  });

  it('reports the DHT total as unavailable rather than zero when both sources fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetServerClient.mockReturnValue(
      createClient({
        userCount: 6017,
        cacheRow: null,
        estimateError: { message: 'statement timeout' },
      })
    );

    const data = await (await GET()).json();
    expect(data.dhtTorrents).toBe(0);
    expect(data.dhtCountSource).toBe('unavailable');
    expect(data.totalTorrents).toBe(6017);
  });

  it('survives the DHT table not existing at all', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockGetServerClient.mockReturnValue(
      createClient({ userCount: 6017, cacheRow: null, estimateThrows: true })
    );

    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.dhtCountSource).toBe('unavailable');
    expect(data.totalTorrents).toBe(6017);
  });

  it('returns 500 when the user torrent count fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetServerClient.mockReturnValue(
      createClient({ userError: { message: 'connection refused' } })
    );

    const response = await GET();
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe('Failed to get statistics');
  });
});
