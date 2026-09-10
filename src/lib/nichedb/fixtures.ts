/**
 * nichedb `screen` title items as they come off the wire (0.6.1), for tests.
 * Shapes copied from live answers on 2026-09-10.
 */

import type { NichedbTitleItem } from './titles';

export function imdbTitle(over: Partial<NichedbTitleItem> = {}, data: Record<string, unknown> = {}): NichedbTitleItem {
  return {
    id: 3742539,
    collection: 'screen',
    kind: 'title',
    external_id: 'imdb:title:tt0133093',
    updated_at: '2026-09-10T14:05:02.923Z',
    title: 'The Matrix',
    summary: null,
    url: 'https://www.imdb.com/title/tt0133093/',
    image_url: null,
    published_at: '1999-07-01T12:00:00.000Z',
    tags: ['title', 'film', 'imdb', 'genre:action', 'genre:sci-fi'],
    ...over,
    data: {
      form: 'movie',
      year: 1999,
      watch: [],
      genres: ['Action', 'Sci-Fi'],
      imdbId: 'tt0133093',
      rating: 8.7,
      tmdbId: null,
      endYear: null,
      tagline: null,
      category: 'film',
      provider: 'imdb',
      tvmazeId: null,
      anilistId: null,
      normTitle: 'the matrix',
      titleType: 'movie',
      popularity: null,
      runtimeMin: 136,
      trailerUrl: null,
      backdropUrl: null,
      ratingCount: 2276418,
      originalTitle: 'The Matrix',
      ...data,
    },
  };
}

export function tmdbTitle(over: Partial<NichedbTitleItem> = {}, data: Record<string, unknown> = {}): NichedbTitleItem {
  return {
    id: 3729335,
    collection: 'screen',
    kind: 'title',
    external_id: 'tmdb:title:603',
    updated_at: '2026-09-10T14:03:59.947Z',
    title: 'The Matrix',
    summary: 'Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.',
    url: 'https://www.themoviedb.org/movie/603',
    image_url: 'https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg',
    published_at: '1999-03-31T12:00:00.000Z',
    tags: ['title', 'film', 'tmdb', 'genre:action', 'genre:science-fiction'],
    ...over,
    data: {
      cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss', 'Hugo Weaving', 'Gloria Foster', 'Joe Pantoliano', 'Marcus Chong', 'Julian Arahanga'],
      form: 'movie',
      year: 1999,
      watch: ['YouTube TV'],
      genres: ['Action', 'Science Fiction'],
      imdbId: 'tt0133093',
      rating: 8.257,
      tmdbId: '603',
      tagline: 'Believe the unbelievable.',
      category: 'film',
      provider: 'tmdb',
      normTitle: 'the matrix',
      popularity: 47.1488,
      runtimeMin: 136,
      trailerUrl: 'https://www.youtube.com/watch?v=FVI84Dfx2-I',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/lrtSb1skJayPydZk0OSMAKjBOVe.jpg',
      ratingCount: 28678,
      originalTitle: 'The Matrix',
      ...data,
    },
  };
}

export function tvmazeTitle(over: Partial<NichedbTitleItem> = {}, data: Record<string, unknown> = {}): NichedbTitleItem {
  return {
    id: 3611951,
    collection: 'screen',
    kind: 'title',
    external_id: 'tvmaze:title:93688',
    updated_at: '2026-09-10T14:03:28.877Z',
    title: 'Perfect Addiction',
    summary: 'Akihito is a college student obsessed with good looks.',
    url: 'https://www.tvmaze.com/shows/93688/perfect-addiction',
    image_url: 'https://static.tvmaze.com/uploads/images/original_untouched/637/1594382.jpg',
    published_at: '2026-07-08T12:00:00.000Z',
    tags: ['title', 'anime', 'tvmaze', 'genre:romance'],
    ...over,
    data: {
      form: 'series',
      year: 2026,
      genres: ['Romance'],
      imdbId: null,
      rating: null,
      tmdbId: null,
      category: 'anime',
      provider: 'tvmaze',
      tvmazeId: '93688',
      normTitle: 'perfect addiction',
      runtimeMin: 5,
      backdropUrl: null,
      ratingCount: null,
      ...data,
    },
  };
}

/** A Response-like object for a mocked fetch. */
export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
