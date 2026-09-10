/**
 * nichedb -> imdb_* mirror: row mapping and the cursor walk.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MIRROR_CURSOR_NAME,
  pageToRows,
  runMirror,
  titleToBasics,
  titleToRatings,
  type MirrorCursor,
  type MirrorRows,
  type MirrorStore,
} from './mirror';
import { imdbTitle, jsonResponse, tmdbTitle, tvmazeTitle } from './fixtures';
import type { NichedbTitleItem } from './titles';

describe('titleToBasics', () => {
  it('maps an IMDb film row onto the dump columns', () => {
    expect(titleToBasics(imdbTitle())).toEqual({
      tconst: 'tt0133093',
      title_type: 'movie',
      primary_title: 'The Matrix',
      original_title: 'The Matrix',
      is_adult: null,
      start_year: 1999,
      end_year: null,
      runtime_minutes: 136,
      genres: 'Action,Sci-Fi',
    });
  });

  it('keeps IMDb titleType and endYear for a series', () => {
    const row = titleToBasics(imdbTitle(
      { external_id: 'imdb:title:tt0039123', title: 'Kraft Television Theatre', tags: ['title', 'tv', 'imdb'] },
      { imdbId: 'tt0039123', form: 'series', titleType: 'tvSeries', year: 1947, endYear: 1958, genres: ['Drama'], runtimeMin: 60, originalTitle: 'Kraft Television Theatre' },
    ));
    expect(row).toMatchObject({ tconst: 'tt0039123', title_type: 'tvSeries', start_year: 1947, end_year: 1958, genres: 'Drama', runtime_minutes: 60 });
  });

  it('derives title_type from form when a non-IMDb row has no titleType', () => {
    expect(titleToBasics(tmdbTitle())?.title_type).toBe('movie');
    expect(titleToBasics(tvmazeTitle({}, { imdbId: 'tt16255458' }))?.title_type).toBe('tvSeries');
  });

  it('takes the tconst from the external id when data.imdbId is missing', () => {
    expect(titleToBasics(imdbTitle({}, { imdbId: null }))?.tconst).toBe('tt0133093');
  });

  it('answers null for a title with no IMDb id, and null fields for missing data', () => {
    expect(titleToBasics(tvmazeTitle())).toBeNull();
    const bare = titleToBasics(imdbTitle({}, { year: null, runtimeMin: null, genres: [], originalTitle: null, titleType: null, form: 'unknown' }));
    expect(bare).toMatchObject({ start_year: null, runtime_minutes: null, genres: null, original_title: 'The Matrix', title_type: null });
  });
});

describe('titleToRatings', () => {
  it('maps rating and votes, rounded to the dump precision', () => {
    expect(titleToRatings(imdbTitle())).toEqual({ tconst: 'tt0133093', average_rating: 8.7, num_votes: 2276418 });
    expect(titleToRatings(imdbTitle({}, { rating: 8.257, ratingCount: 10 }))?.average_rating).toBe(8.3);
  });

  it('answers null when unrated', () => {
    expect(titleToRatings(imdbTitle({}, { rating: null, ratingCount: null }))).toBeNull();
    expect(titleToRatings(imdbTitle({}, { rating: 7, ratingCount: null }))).toBeNull();
  });
});

describe('pageToRows', () => {
  it('writes IMDb rows as basics + ratings and other providers as fill only', () => {
    const rows = pageToRows([imdbTitle(), tmdbTitle(), tvmazeTitle(), tvmazeTitle({ id: 9, external_id: 'tvmaze:title:9' }, { imdbId: 'tt16255458', rating: 4.2, ratingCount: 30 })]);
    expect(rows.basics.map((r) => r.tconst)).toEqual(['tt0133093']);
    expect(rows.basicsFill.map((r) => r.tconst)).toEqual(['tt16255458']);
    expect(rows.ratings).toEqual([{ tconst: 'tt0133093', average_rating: 8.7, num_votes: 2276418 }]);
  });

  it('never lets a TMDB rating masquerade as an IMDb one', () => {
    const rows = pageToRows([tmdbTitle()]);
    expect(rows.ratings).toEqual([]);
    expect(rows.basicsFill).toHaveLength(1);
  });

  it('dedupes within a page, IMDb row winning whatever the order', () => {
    const a = pageToRows([tmdbTitle(), imdbTitle()]);
    const b = pageToRows([imdbTitle(), tmdbTitle()]);
    for (const rows of [a, b]) {
      expect(rows.basics).toHaveLength(1);
      expect(rows.basicsFill).toHaveLength(0);
      expect(rows.basics[0].genres).toBe('Action,Sci-Fi');
    }
  });
});

function memoryStore(initial: MirrorCursor | null = null) {
  let cursor = initial;
  const saves: MirrorCursor[] = [];
  const writes: MirrorRows[] = [];
  const store: MirrorStore = {
    loadCursor: vi.fn(async () => cursor),
    saveCursor: vi.fn(async (_name: string, c: MirrorCursor) => { cursor = { ...c }; saves.push({ ...c }); }),
    writeRows: vi.fn(async (rows: MirrorRows) => { writes.push(rows); }),
  };
  return { store, saves, writes, cursor: () => cursor };
}

function pageOf(ids: number[]): NichedbTitleItem[] {
  return ids.map((id) => imdbTitle({ id, external_id: `imdb:title:tt${String(id).padStart(7, '0')}` }, { imdbId: `tt${String(id).padStart(7, '0')}` }));
}

/** A fetch that serves id-ordered pages of `limit` from `all`, honouring `after`. */
function pagedFetch(all: number[], opts: { headers?: Record<string, string> } = {}) {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const after = Number(url.searchParams.get('after') ?? 0);
    const limit = Number(url.searchParams.get('limit'));
    const items = pageOf(all.filter((id) => id > after).slice(0, limit));
    return jsonResponse({ count: items.length, items }, { headers: opts.headers });
  });
  return { fetchMock, calls };
}

const noSleep = vi.fn(async () => {});
const clock = () => new Date('2026-09-10T00:00:00.000Z');

describe('runMirror', () => {
  it('walks every page, advances the cursor per page, and closes the walk with since=start', async () => {
    const { store, saves, writes } = memoryStore();
    const { fetchMock, calls } = pagedFetch([1, 2, 3, 4, 5]);

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    expect(result).toMatchObject({ pages: 3, items: 5, basics: 5, ratings: 5, completed: true, stoppedBecause: 'completed' });
    expect(calls.map((u) => u.searchParams.get('after'))).toEqual([null, '2', '4']);
    expect(calls.every((u) => !u.searchParams.has('since'))).toBe(true);
    expect(writes).toHaveLength(3);
    // one save per page, then the closing save
    expect(saves.map((s) => s.after_id)).toEqual([2, 4, 5, 0]);
    expect(saves.at(-1)).toEqual({ after_id: 0, since: '2026-09-10T00:00:00.000Z' });
    expect(store.saveCursor).toHaveBeenCalledWith(MIRROR_CURSOR_NAME, expect.anything());
  });

  it('stops at the page cap and leaves a resumable cursor', async () => {
    const { store, saves } = memoryStore();
    const { fetchMock } = pagedFetch([1, 2, 3, 4, 5, 6]);

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 2, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    expect(result).toMatchObject({ pages: 2, items: 4, completed: false, stoppedBecause: 'page-cap' });
    expect(result.cursor).toEqual({ after_id: 4, since: null });
    expect(saves.at(-1)).toEqual({ after_id: 4, since: null });
  });

  it('resumes from a stored cursor and sends its since= with every page', async () => {
    const { store } = memoryStore({ after_id: 4, since: '2026-09-01T00:00:00.000Z' });
    const { fetchMock, calls } = pagedFetch([1, 2, 3, 4, 5, 6]);

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    // [5,6] is a full page, so one more (empty) page closes the walk
    expect(calls.map((u) => u.searchParams.get('after'))).toEqual(['4', '6']);
    expect(calls.every((u) => u.searchParams.get('since') === '2026-09-01T00:00:00.000Z')).toBe(true);
    expect(result).toMatchObject({ pages: 2, items: 2, completed: true });
    // the next walk's watermark is this walk's start, not the old one
    expect(result.cursor).toEqual({ after_id: 0, since: '2026-09-10T00:00:00.000Z' });
  });

  it('a short final page closes the walk in one request when nothing changed', async () => {
    const { store, writes } = memoryStore({ after_id: 0, since: '2026-09-09T00:00:00.000Z' });
    const { fetchMock } = pagedFetch([]);

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    expect(result).toMatchObject({ pages: 1, items: 0, completed: true });
    expect(writes).toHaveLength(0);
    expect(result.cursor.since).toBe('2026-09-10T00:00:00.000Z');
  });

  it('sleeps the interval between pages, not after the last', async () => {
    const { store } = memoryStore();
    const { fetchMock } = pagedFetch([1, 2, 3, 4]);
    const sleep = vi.fn(async (_ms: number) => {});

    await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 7000, pageLimit: 2, sleep, now: clock });

    // pages: [1,2] full -> sleep; [3,4] full -> sleep; [] short -> done
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([7000, 7000]);
  });

  it('waits out a 429 and carries on, keeping the cursor', async () => {
    const { store } = memoryStore();
    let n = 0;
    const fetchMock = vi.fn(async (input: string) => {
      n += 1;
      if (n === 2) return jsonResponse({ error: 'slow down' }, { status: 429 });
      const after = Number(new URL(input).searchParams.get('after') ?? 0);
      const items = pageOf([1, 2, 3].filter((id) => id > after).slice(0, 2));
      return jsonResponse({ count: items.length, items });
    });
    const sleep = vi.fn(async (_ms: number) => {});

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep, now: clock });

    expect(result).toMatchObject({ pages: 2, items: 3, completed: true });
    expect(sleep.mock.calls.map((c) => c[0])).toContain(60_000);
  });

  it('gives up after repeated 429s without touching the cursor', async () => {
    const { store, saves } = memoryStore({ after_id: 10, since: null });
    const fetchMock = vi.fn(async () => jsonResponse({}, { status: 429 }));

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, sleep: noSleep, now: clock, maxRateLimitWaits: 1 });

    expect(result.stoppedBecause).toBe('rate-limit');
    expect(result.cursor).toEqual({ after_id: 10, since: null });
    expect(saves).toHaveLength(0);
  });

  it('stops on a network failure with the cursor where the last good page left it', async () => {
    const { store } = memoryStore();
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error('reset');
      return jsonResponse({ count: 2, items: pageOf([1, 2]) });
    });

    const result = await runMirror({ store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    expect(result).toMatchObject({ pages: 1, stoppedBecause: 'network', completed: false });
    expect(result.cursor).toEqual({ after_id: 2, since: null });
  });

  it('is idempotent: re-running a completed walk re-fetches nothing new and rewrites the same rows', async () => {
    const first = memoryStore();
    const { fetchMock } = pagedFetch([1, 2, 3]);
    await runMirror({ store: first.store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });

    const second = memoryStore({ after_id: 0, since: null });
    await runMirror({ store: second.store, fetch: fetchMock, maxPages: 0, intervalMs: 5, pageLimit: 2, sleep: noSleep, now: clock });
    expect(second.writes).toEqual(first.writes);
  });
});
