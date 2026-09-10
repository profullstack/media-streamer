/**
 * fetchTmdbData: cache -> nichedb (NICHEDB_TITLES=1) -> TMDB, and what lands in tmdb_data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { imdbTitle, jsonResponse, tmdbTitle } from '@/lib/nichedb/fixtures';

const supabaseMock = vi.hoisted(() => {
  const state = { cached: null as Record<string, unknown> | null, upserts: [] as Array<{ table: string; row: Record<string, unknown> }> };
  const from = vi.fn((table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: state.cached, error: null }) }) }),
    upsert: async (row: Record<string, unknown>) => { state.upserts.push({ table, row }); return { error: null }; },
  }));
  return { state, from };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: supabaseMock.from }),
}));

import { fetchTmdbData, fetchNichedbData } from './tmdb';

function tmdbFind(movie: Record<string, unknown> | null) {
  return { movie_results: movie ? [movie] : [], tv_results: [] };
}

const TMDB_MOVIE = { id: 603, poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'TMDB overview' };
const TMDB_DETAIL = {
  tagline: 'TMDB tagline',
  overview: 'TMDB overview',
  credits: { cast: [{ name: 'Keanu Reeves' }], crew: [{ department: 'Writing', name: 'Lana Wachowski' }] },
  release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }] },
};

/** A fetch that answers nichedb and TMDB by host and records what it was asked. */
function routedFetch(routes: { nichedb?: (url: URL) => Response; tmdb?: (url: URL) => Response }) {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    if (url.hostname === 'nichedb.dev') return routes.nichedb?.(url) ?? jsonResponse({ count: 0, items: [] });
    if (url.hostname === 'api.themoviedb.org') {
      if (routes.tmdb) return routes.tmdb(url);
      if (url.pathname.startsWith('/3/find/')) return jsonResponse(tmdbFind(TMDB_MOVIE));
      if (url.pathname.startsWith('/3/movie/')) return jsonResponse(TMDB_DETAIL);
      if (url.pathname.startsWith('/3/search/')) return jsonResponse({ results: [] });
    }
    return jsonResponse({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const hosts = () => calls.map((u) => u.hostname + u.pathname);
  return { fetchMock, calls, hosts };
}

beforeEach(() => {
  supabaseMock.state.cached = null;
  supabaseMock.state.upserts = [];
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('TMDB_API_KEY', 'tmdb-key');
  vi.stubEnv('NICHEDB_TITLES', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchTmdbData with NICHEDB_TITLES off (default)', () => {
  it('never talks to nichedb and caches the TMDB answer as before', async () => {
    const { hosts } = routedFetch({});
    const data = await fetchTmdbData('tt0133093', 'The.Matrix.1999.1080p');

    expect(hosts().some((h) => h.startsWith('nichedb.dev'))).toBe(false);
    expect(hosts()).toEqual(['api.themoviedb.org/3/find/tt0133093', 'api.themoviedb.org/3/movie/603']);
    expect(data).toEqual({
      posterUrl: 'https://image.tmdb.org/t/p/w500/p.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/b.jpg',
      overview: 'TMDB overview',
      tagline: 'TMDB tagline',
      cast: 'Keanu Reeves',
      writers: 'Lana Wachowski',
      contentRating: 'R',
      tmdbId: 603,
    });
    expect(supabaseMock.state.upserts).toEqual([{ table: 'tmdb_data', row: expect.objectContaining({ lookup_key: 'tt0133093', tmdb_id: 603 }) }]);
  });

  it('is EMPTY without a TMDB key', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    const { fetchMock } = routedFetch({});
    const data = await fetchTmdbData('tt0133093', 'The Matrix');
    expect(data.posterUrl).toBeNull();
    expect(data.tmdbId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchTmdbData with NICHEDB_TITLES=1', () => {
  beforeEach(() => vi.stubEnv('NICHEDB_TITLES', '1'));

  it('serves the cache first without any network call', async () => {
    supabaseMock.state.cached = { poster_url: 'cached.jpg', backdrop_url: null, overview: 'cached', tagline: null, cast_names: null, writers: null, content_rating: null, tmdb_id: 1 };
    const { fetchMock } = routedFetch({});
    const data = await fetchTmdbData('tt0133093', 'The Matrix');
    expect(data.posterUrl).toBe('cached.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes the nichedb TMDB row, skips TMDB, and writes tmdb_data in the same shape', async () => {
    const { hosts, calls } = routedFetch({
      nichedb: () => jsonResponse({ q: 'x', parsed: {}, count: 2, items: [imdbTitle({ score: 1 }), tmdbTitle({ score: 1 })] }),
    });
    const data = await fetchTmdbData('tt0133093', 'The.Matrix.1999.1080p.BluRay.x264-GROUP');

    expect(hosts()).toEqual(['nichedb.dev/api/v1/match']);
    expect(calls[0].searchParams.get('q')).toBe('The.Matrix.1999.1080p.BluRay.x264-GROUP');
    expect(data).toEqual({
      posterUrl: 'https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/lrtSb1skJayPydZk0OSMAKjBOVe.jpg',
      overview: expect.stringMatching(/^Set in the 22nd century/),
      tagline: 'Believe the unbelievable.',
      cast: expect.stringMatching(/^Keanu Reeves, Laurence Fishburne/),
      writers: null,
      contentRating: null,
      tmdbId: 603,
    });
    expect(supabaseMock.state.upserts).toEqual([{
      table: 'tmdb_data',
      row: {
        lookup_key: 'tt0133093',
        tmdb_id: 603,
        poster_url: 'https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg',
        backdrop_url: 'https://image.tmdb.org/t/p/w780/lrtSb1skJayPydZk0OSMAKjBOVe.jpg',
        overview: expect.any(String),
        tagline: 'Believe the unbelievable.',
        cast_names: expect.any(String),
        writers: null,
        content_rating: null,
      },
    }]);
  });

  it('falls back to TMDB when nichedb only has the bare IMDb row (nothing to show)', async () => {
    const { hosts } = routedFetch({
      nichedb: () => jsonResponse({ q: 'x', parsed: {}, count: 1, items: [imdbTitle({ score: 1 })] }),
    });
    const data = await fetchTmdbData('tt0133093', 'The Matrix 1999');
    expect(hosts()).toEqual(['nichedb.dev/api/v1/match', 'api.themoviedb.org/3/find/tt0133093', 'api.themoviedb.org/3/movie/603']);
    expect(data.posterUrl).toBe('https://image.tmdb.org/t/p/w500/p.jpg');
    expect(data.writers).toBe('Lana Wachowski');
  });

  it('falls back to TMDB when nichedb has a different title for that name (tconst mismatch)', async () => {
    const { hosts } = routedFetch({
      nichedb: () => jsonResponse({ q: 'x', parsed: {}, count: 1, items: [tmdbTitle({ score: 1 }, { imdbId: 'tt9999999' })] }),
    });
    await fetchTmdbData('tt0133093', 'The Matrix 1999');
    expect(hosts()[0]).toBe('nichedb.dev/api/v1/match');
    expect(hosts()).toContain('api.themoviedb.org/3/find/tt0133093');
  });

  it('falls back to TMDB when nichedb errors', async () => {
    const { hosts } = routedFetch({ nichedb: () => jsonResponse({ error: 'down' }, { status: 503 }) });
    const data = await fetchTmdbData('tt0133093', 'The Matrix 1999');
    expect(hosts()).toContain('api.themoviedb.org/3/find/tt0133093');
    expect(data.tmdbId).toBe(603);
  });

  it('without an IMDb id uses the best match at or above the floor, poster row preferred', async () => {
    const { hosts } = routedFetch({
      nichedb: () => jsonResponse({ q: 'x', parsed: {}, count: 2, items: [imdbTitle({ score: 1 }), tmdbTitle({ score: 1 })] }),
    });
    const data = await fetchTmdbData('', 'The.Matrix.1999.1080p');
    expect(hosts()).toEqual(['nichedb.dev/api/v1/match']);
    expect(data.tmdbId).toBe(603);
    expect(supabaseMock.state.upserts[0].row.lookup_key).toMatch(/^title:[0-9a-f]{32}$/);
  });

  it('without an IMDb id a below-floor match goes on to the TMDB search', async () => {
    const { hosts } = routedFetch({
      nichedb: () => jsonResponse({ q: 'x', parsed: {}, count: 1, items: [tmdbTitle({ score: 0.3 })] }),
      tmdb: (url) => url.pathname.startsWith('/3/search/tv') ? jsonResponse({ results: [] }) : url.pathname.startsWith('/3/search/movie') ? jsonResponse({ results: [TMDB_MOVIE] }) : jsonResponse(TMDB_DETAIL),
    });
    const data = await fetchTmdbData('', 'The Matrix 1999');
    expect(hosts()[0]).toBe('nichedb.dev/api/v1/match');
    expect(hosts()).toContain('api.themoviedb.org/3/search/movie');
    expect(data.tmdbId).toBe(603);
  });

  it('still asks nichedb without a TMDB key, and is EMPTY (uncached) when nichedb has nothing', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    const { hosts } = routedFetch({});
    const data = await fetchTmdbData('tt0133093', 'The Matrix');
    expect(hosts()).toEqual(['nichedb.dev/api/v1/match']);
    expect(data.tmdbId).toBeNull();
    expect(supabaseMock.state.upserts).toEqual([]);
  });
});

describe('fetchNichedbData', () => {
  it('answers null without a title hint (nothing to ask nichedb for)', async () => {
    const { fetchMock } = routedFetch({});
    expect(await fetchNichedbData('tt0133093', '')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
