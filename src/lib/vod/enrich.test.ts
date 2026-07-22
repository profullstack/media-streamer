import { describe, expect, it } from 'vitest';

import { cleanTitleForSearch, enrichPosters } from './enrich';
import type { CatalogItem } from './types';

describe('cleanTitleForSearch', () => {
  it('strips bracketed tags and quality/codec keywords', () => {
    expect(cleanTitleForSearch('The Matrix (1999) [4K] x265')).toBe('The Matrix');
    expect(cleanTitleForSearch('Inception 1080p MULTI')).toBe('Inception');
  });
  it('strips a leading language/country prefix', () => {
    expect(cleanTitleForSearch('EN - Breaking Bad')).toBe('Breaking Bad');
    expect(cleanTitleForSearch('US | The Office')).toBe('The Office');
  });
  it('normalizes separators', () => {
    expect(cleanTitleForSearch('Some.Movie.Name')).toBe('Some Movie Name');
  });
});

describe('enrichPosters', () => {
  it('is a no-op (returns 0) when TMDB_API_KEY is unset', async () => {
    const prev = process.env.TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    const items: CatalogItem[] = [
      { externalId: '1', title: 'X', kind: 'movie', streamRef: 'a', posterUrl: null },
    ];
    expect(await enrichPosters(items)).toBe(0);
    expect(items[0].posterUrl).toBeNull();
    if (prev !== undefined) process.env.TMDB_API_KEY = prev;
  });
});
