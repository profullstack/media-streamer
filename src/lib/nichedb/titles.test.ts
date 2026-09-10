/**
 * nichedb titles client: the match pick, id extraction, facts, and the wire calls.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MATCH_SCORE_FLOOR,
  fetchTitlesPage,
  hasPresentation,
  imdbIdOf,
  matchTitle,
  pickMatch,
  titleByImdbId,
  titleFacts,
} from './titles';
import { imdbTitle, jsonResponse, tmdbTitle, tvmazeTitle } from './fixtures';

describe('imdbIdOf', () => {
  it('reads data.imdbId first', () => {
    expect(imdbIdOf(tmdbTitle())).toBe('tt0133093');
  });

  it('falls back to the imdb:title external id', () => {
    expect(imdbIdOf(imdbTitle({}, { imdbId: null }))).toBe('tt0133093');
  });

  it('answers null when neither carries a tconst', () => {
    expect(imdbIdOf(tvmazeTitle())).toBeNull();
    expect(imdbIdOf(tmdbTitle({}, { imdbId: 'garbage' }))).toBeNull();
  });
});

describe('pickMatch', () => {
  it('prefers the row with a poster among exact titles', () => {
    const imdb = imdbTitle({ score: 1 });
    const tmdb = tmdbTitle({ score: 1 });
    expect(pickMatch([imdb, tmdb])?.external_id).toBe('tmdb:title:603');
    expect(pickMatch([tmdb, imdb])?.external_id).toBe('tmdb:title:603');
  });

  it('takes the best score even when a lower one has a poster', () => {
    const exact = imdbTitle({ score: 1 });
    const near = tmdbTitle({ id: 1, external_id: 'tmdb:title:1', title: 'The Matrix Reloaded', score: 0.8 });
    expect(pickMatch([near, exact])?.external_id).toBe('imdb:title:tt0133093');
  });

  it('answers null when nothing reaches the floor', () => {
    const low = tmdbTitle({ score: MATCH_SCORE_FLOOR - 0.01 });
    expect(pickMatch([low])).toBeNull();
    expect(pickMatch([])).toBeNull();
  });

  it('accepts a candidate exactly at the floor', () => {
    const at = tmdbTitle({ score: MATCH_SCORE_FLOOR });
    expect(pickMatch([at])).toBe(at);
  });

  it('with an imdbId keeps only rows carrying that tconst, regardless of score', () => {
    // Live shape: "Dune" (tmdb, score 1) vs "Dune: Part One" (imdb, score 0.38), same tconst.
    const other = tmdbTitle({ id: 2, external_id: 'tmdb:title:2', title: 'Dune', score: 1 }, { imdbId: 'tt1160419' });
    const wanted = imdbTitle({ id: 3, external_id: 'imdb:title:tt0000001', title: 'Dune World', score: 0.45 }, { imdbId: 'tt0000001' });
    expect(pickMatch([other, wanted], { imdbId: 'tt0000001' })?.id).toBe(3);
    expect(pickMatch([other, wanted], { imdbId: 'tt9999999' })).toBeNull();
  });

  it('with an imdbId still prefers the poster row among rows for that tconst', () => {
    const imdb = imdbTitle({ score: 0.38, title: 'Dune: Part One' }, { imdbId: 'tt1160419' });
    const tmdb = tmdbTitle({ score: 1, title: 'Dune' }, { imdbId: 'tt1160419' });
    expect(pickMatch([imdb, tmdb], { imdbId: 'tt1160419' })?.external_id).toBe('tmdb:title:603');
  });
});

describe('hasPresentation / titleFacts', () => {
  it('an IMDb row has nothing to show, a TMDB row does', () => {
    expect(hasPresentation(imdbTitle())).toBe(false);
    expect(hasPresentation(tmdbTitle())).toBe(true);
    expect(hasPresentation(imdbTitle({ summary: 'A plot.' }))).toBe(true);
  });

  it('normalises a TMDB row', () => {
    const f = titleFacts(tmdbTitle());
    expect(f).toMatchObject({
      imdbId: 'tt0133093',
      tmdbId: 603,
      year: 1999,
      form: 'movie',
      category: 'film',
      rating: 8.257,
      ratingCount: 28678,
      runtimeMin: 136,
      posterUrl: 'https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/lrtSb1skJayPydZk0OSMAKjBOVe.jpg',
      tagline: 'Believe the unbelievable.',
    });
    expect(f.genres).toEqual(['Action', 'Science Fiction']);
    expect(f.cast).toBe('Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss, Hugo Weaving, Gloria Foster, Joe Pantoliano, Marcus Chong, Julian Arahanga');
    expect(f.overview).toMatch(/^Set in the 22nd century/);
  });

  it('normalises an IMDb row with nulls where it has nothing', () => {
    const f = titleFacts(imdbTitle());
    expect(f).toMatchObject({ tmdbId: null, posterUrl: null, backdropUrl: null, overview: null, tagline: null, cast: null, rating: 8.7 });
  });
});

describe('matchTitle', () => {
  it('asks /api/v1/match with the release name and year and picks the poster row', async () => {
    const fetchMock = vi.fn(async (_input: string) =>
      jsonResponse({ q: 'x', parsed: {}, count: 2, items: [imdbTitle({ score: 1 }), tmdbTitle({ score: 1 })] }),
    );
    const item = await matchTitle('The.Matrix.1999.1080p.BluRay.x264-GROUP', { year: 1999, fetch: fetchMock });
    expect(item?.external_id).toBe('tmdb:title:603');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/match');
    expect(url.searchParams.get('q')).toBe('The.Matrix.1999.1080p.BluRay.x264-GROUP');
    expect(url.searchParams.get('collection')).toBe('screen');
    expect(url.searchParams.get('kind')).toBe('title');
    expect(url.searchParams.get('year')).toBe('1999');
  });

  it('answers null on a non-2xx or a thrown fetch', async () => {
    expect(await matchTitle('x', { fetch: vi.fn(async () => jsonResponse({}, { status: 503 })) })).toBeNull();
    expect(await matchTitle('x', { fetch: vi.fn(async () => { throw new Error('down'); }) })).toBeNull();
  });

  it('does not call out for an empty name', async () => {
    const fetchMock = vi.fn();
    expect(await matchTitle('   ', { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('titleByImdbId', () => {
  it('matches on the known title and keeps the row carrying the tconst', async () => {
    const fetchMock = vi.fn(async (_input: string) =>
      jsonResponse({ q: 'x', parsed: {}, count: 2, items: [imdbTitle({ score: 1 }), tmdbTitle({ score: 1 })] }),
    );
    const item = await titleByImdbId('tt0133093', { title: 'The Matrix', year: 1999 }, { fetch: fetchMock });
    expect(item?.external_id).toBe('tmdb:title:603');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('The Matrix');
    expect(url.searchParams.get('year')).toBe('1999');
  });

  it('answers null when no candidate carries the tconst', async () => {
    const fetchMock = vi.fn(async (_input: string) => jsonResponse({ q: 'x', parsed: {}, count: 1, items: [tmdbTitle({ score: 1 })] }));
    expect(await titleByImdbId('tt7777777', { title: 'The Matrix' }, { fetch: fetchMock })).toBeNull();
  });

  it('answers null without a title to ask for, and for a malformed tconst', async () => {
    const fetchMock = vi.fn();
    expect(await titleByImdbId('tt0133093', {}, { fetch: fetchMock })).toBeNull();
    expect(await titleByImdbId('nm0000001', { title: 'x' }, { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchTitlesPage', () => {
  it('builds the id-ordered page query with after, since and tags', async () => {
    const fetchMock = vi.fn(async (_input: string) =>
      jsonResponse({ count: 1, items: [imdbTitle()] }, { headers: { 'x-ratelimit-remaining': '498' } }),
    );
    const res = await fetchTitlesPage({ after: 42, since: '2026-09-01T00:00:00.000Z', limit: 200, tags: ['imdb'] }, { fetch: fetchMock });
    expect(res?.status).toBe(200);
    expect(res?.rateRemaining).toBe(498);
    expect(res?.page.items).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/items');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      collection: 'screen', kind: 'title', sort: 'id', order: 'asc', limit: '200',
      after: '42', since: '2026-09-01T00:00:00.000Z', tags: 'imdb',
    });
  });

  it('omits after and since on a first page', async () => {
    const fetchMock = vi.fn(async (_input: string) => jsonResponse({ count: 0, items: [] }));
    await fetchTitlesPage({ after: 0, since: null }, { fetch: fetchMock });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.has('after')).toBe(false);
    expect(url.searchParams.has('since')).toBe(false);
  });

  it('reports the status on a 429 and null on a network failure', async () => {
    const limited = await fetchTitlesPage({}, { fetch: vi.fn(async () => jsonResponse({ error: 'slow down' }, { status: 429, headers: { 'x-ratelimit-remaining': '0' } })) });
    expect(limited?.status).toBe(429);
    expect(limited?.rateRemaining).toBe(0);
    expect(await fetchTitlesPage({}, { fetch: vi.fn(async () => { throw new Error('reset'); }) })).toBeNull();
  });
});
