/**
 * TMDB poster enrichment for VOD catalog sync.
 *
 * Provider catalogs (esp. M3U / HTTP-library) often lack poster art. During
 * sync we look up titles missing a poster on TMDB and fill in poster/plot/
 * rating. Best-effort: a no-op when `TMDB_API_KEY` is unset, never throws, and
 * capped per sync to bound latency + API usage. Identical titles (e.g. every
 * episode of a series) are looked up once per run.
 */

import { getTMDBService } from '@/lib/tmdb';
import type { CatalogItem } from './types';

/** Max distinct TMDB lookups per sync. */
export const MAX_ENRICH_LOOKUPS = 300;

/** Strip quality/language/release tags so TMDB search matches the real title. */
export function cleanTitleForSearch(raw: string): string {
  let t = raw;
  // Drop bracketed / parenthetical tags: [4K], (2021), {MULTI}, …
  t = t.replace(/[[({][^\])}]*[\])}]/g, ' ');
  // Drop common quality / codec / source / language tags.
  t = t.replace(
    /\b(4k|uhd|1080p|720p|480p|2160p|hdr|hdr10|x265|x264|h265|h264|hevc|web-?dl|webrip|bluray|bdrip|hdtv|multi|dual|vostfr|subbed|dubbed|ita|eng|fr|es|latino)\b/gi,
    ' '
  );
  // Drop a leading language/country code prefix like "EN - ", "US | ", "VOD: ".
  t = t.replace(/^\s*[A-Za-z]{2,4}\s*[-|:]\s+/, '');
  // Separators → spaces, collapse.
  t = t.replace(/[._]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return t;
}

function tmdbAvailable(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
}

interface Match {
  posterUrl: string | null;
  plot: string | null;
  rating: string | null;
}

/**
 * Fill poster/plot/rating on catalog items that lack a poster, using TMDB.
 * Mutates `items` in place and returns the number of posters filled.
 */
export async function enrichPosters(items: CatalogItem[]): Promise<number> {
  if (!tmdbAvailable()) return 0;
  let service: ReturnType<typeof getTMDBService>;
  try {
    service = getTMDBService();
  } catch {
    return 0;
  }

  const targets = items.filter((i) => !i.posterUrl);
  if (targets.length === 0) return 0;

  const cache = new Map<string, Match>();
  let lookups = 0;
  let enriched = 0;

  for (const item of targets) {
    const query = cleanTitleForSearch(item.title);
    if (!query) continue;
    const key = query.toLowerCase();

    let match = cache.get(key);
    if (match === undefined) {
      if (lookups >= MAX_ENRICH_LOOKUPS) break;
      lookups += 1;
      match = { posterUrl: null, plot: null, rating: null };
      try {
        const res = await service.searchMulti(query);
        const top = res.items[0];
        if (top) {
          match = {
            posterUrl: top.posterUrl,
            plot: top.overview,
            rating: top.voteAverage != null ? String(top.voteAverage) : null,
          };
        }
      } catch {
        // leave as empty match
      }
      cache.set(key, match);
    }

    if (match.posterUrl) {
      item.posterUrl = match.posterUrl;
      enriched += 1;
    }
    if (!item.plot && match.plot) item.plot = match.plot;
    if (!item.rating && match.rating) item.rating = match.rating;
  }

  return enriched;
}
