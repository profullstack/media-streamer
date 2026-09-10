/**
 * nichedb.dev `screen` collection: film / tv / anime titles.
 *
 * nichedb keeps one row per provider for a title, so a film usually has both an
 * `imdb:title:<tconst>` row (rating, votes, runtime, no poster, no summary) and a
 * `tmdb:title:<id>` row (poster, backdrop, summary, tagline, cast). Both carry
 * `data.imdbId`, which is how the two are tied together here.
 *
 * Read API (anonymous, 600 requests/hour per IP):
 *   GET /api/v1/items?collection=screen&kind=title&sort=id&order=asc&after=<id>&since=<ISO>&limit=200
 *   GET /api/v1/match?q=<release name>&collection=screen&kind=title[&year=]
 *
 * `match` cleans a release name itself (year, S02E03, quality tags, group) and
 * answers items with a `score` in 0..1; an exact title is 1.0.
 *
 * Nothing in here touches the database. The switch that routes bittorrented's
 * reads through nichedb is NICHEDB_TITLES=1 (see src/lib/imdb/tmdb.ts).
 */

export const NICHEDB_BASE_URL = 'https://nichedb.dev';

/** Below this `match` score a candidate is not the title the name refers to. */
export const MATCH_SCORE_FLOOR = 0.5;

export const DEFAULT_PAGE_LIMIT = 200;

/** An item of the `screen` collection with kind `title`, as it comes off the wire (0.6.1). */
export interface NichedbTitleItem {
  id: number;
  collection: string;
  kind: string;
  external_id: string;
  updated_at: string;
  title: string;
  summary: string | null;
  url: string | null;
  image_url: string | null;
  published_at: string | null;
  tags: string[];
  data: NichedbTitleData;
  /** Only on `/api/v1/match` answers. */
  score?: number;
}

export interface NichedbTitleData {
  provider?: string;
  category?: 'film' | 'tv' | 'anime' | string;
  form?: 'movie' | 'series' | string;
  year?: number | null;
  endYear?: number | null;
  normTitle?: string;
  originalTitle?: string | null;
  titleType?: string | null;
  isAdult?: boolean | null;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  genres?: string[] | null;
  rating?: number | null;
  ratingCount?: number | null;
  popularity?: number | null;
  backdropUrl?: string | null;
  tagline?: string | null;
  trailerUrl?: string | null;
  runtimeMin?: number | null;
  watch?: string[] | null;
  cast?: string[] | null;
  [key: string]: unknown;
}

export interface NichedbItemsPage {
  count: number;
  items: NichedbTitleItem[];
}

export interface NichedbMatchResponse {
  q: string;
  parsed: { name: string; year: number | null; season: number | null; episode: number | null; kind: string };
  count: number;
  items: NichedbTitleItem[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface NichedbClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  /** Per-request timeout; the site calls this on a page render. */
  timeoutMs?: number;
}

function resolveOptions(opts: NichedbClientOptions = {}) {
  return {
    baseUrl: (opts.baseUrl ?? process.env.NICHEDB_BASE_URL ?? NICHEDB_BASE_URL).replace(/\/$/, ''),
    fetch: opts.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init)),
    timeoutMs: opts.timeoutMs ?? 8000,
  };
}

async function getJson<T>(url: string, opts: NichedbClientOptions): Promise<T | null> {
  const { fetch: doFetch, timeoutMs } = resolveOptions(opts);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'bittorrented.com (nichedb mirror)' },
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The IMDb tconst of an item: `data.imdbId`, else the `imdb:title:<tconst>` external id. */
export function imdbIdOf(item: Pick<NichedbTitleItem, 'external_id' | 'data'>): string | null {
  const fromData = item.data?.imdbId;
  if (typeof fromData === 'string' && /^tt\d+$/.test(fromData)) return fromData;
  const m = /^imdb:title:(tt\d+)$/.exec(item.external_id ?? '');
  return m ? m[1] : null;
}

/** What a title page can show from one nichedb row, normalised. */
export interface NichedbTitleFacts {
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  year: number | null;
  form: 'movie' | 'series' | null;
  category: 'film' | 'tv' | 'anime' | null;
  genres: string[];
  rating: number | null;
  ratingCount: number | null;
  runtimeMin: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  tagline: string | null;
  cast: string | null;
}

export function titleFacts(item: NichedbTitleItem): NichedbTitleFacts {
  const d = item.data ?? {};
  const tmdbId = d.tmdbId != null && d.tmdbId !== '' ? Number(d.tmdbId) : NaN;
  const form = d.form === 'movie' || d.form === 'series' ? d.form : null;
  const category = d.category === 'film' || d.category === 'tv' || d.category === 'anime' ? d.category : null;
  const cast = Array.isArray(d.cast) ? d.cast.filter((c): c is string => typeof c === 'string' && c.length > 0).slice(0, 8) : [];
  return {
    imdbId: imdbIdOf(item),
    tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
    title: item.title,
    year: typeof d.year === 'number' ? d.year : null,
    form,
    category,
    genres: Array.isArray(d.genres) ? d.genres.filter((g): g is string => typeof g === 'string') : [],
    rating: typeof d.rating === 'number' ? d.rating : null,
    ratingCount: typeof d.ratingCount === 'number' ? d.ratingCount : null,
    runtimeMin: typeof d.runtimeMin === 'number' ? d.runtimeMin : null,
    posterUrl: item.image_url || null,
    backdropUrl: (typeof d.backdropUrl === 'string' && d.backdropUrl) || null,
    overview: item.summary || null,
    tagline: (typeof d.tagline === 'string' && d.tagline) || null,
    cast: cast.length ? cast.join(', ') : null,
  };
}

/** Does the item carry anything a torrent page would show beyond what imdb_* already has? */
export function hasPresentation(item: NichedbTitleItem): boolean {
  return Boolean(item.image_url || item.summary || item.data?.backdropUrl);
}

/**
 * Pick the item a `match` answer refers to.
 *
 * Exact titles (score 1.0) come back once per provider; only the TMDB row has a
 * poster, so among the best-scoring candidates the one with an image wins. Anything
 * under the floor is not a match at all.
 *
 * When `imdbId` is given the pick is restricted to rows that carry that tconst,
 * whatever their score: the caller already knows which title it wants and only
 * needs nichedb's presentation for it.
 */
export function pickMatch(
  items: NichedbTitleItem[],
  opts: { imdbId?: string | null; floor?: number } = {},
): NichedbTitleItem | null {
  const floor = opts.floor ?? MATCH_SCORE_FLOOR;
  let pool = items;
  if (opts.imdbId) {
    pool = items.filter((i) => imdbIdOf(i) === opts.imdbId);
  } else {
    pool = items.filter((i) => (i.score ?? 0) >= floor);
  }
  if (pool.length === 0) return null;

  const best = Math.max(...pool.map((i) => i.score ?? 0));
  const top = pool.filter((i) => (i.score ?? 0) === best);
  return top.find((i) => Boolean(i.image_url)) ?? top.find(hasPresentation) ?? top[0];
}

/** Raw `match` candidates for a release name, unranked beyond what nichedb did. */
export async function matchCandidates(
  name: string,
  opts: { year?: number | null; limit?: number } & NichedbClientOptions = {},
): Promise<NichedbTitleItem[]> {
  const q = name.trim();
  if (!q) return [];
  const { baseUrl } = resolveOptions(opts);
  const params = new URLSearchParams({ q, collection: 'screen', kind: 'title' });
  if (opts.year) params.set('year', String(opts.year));
  if (opts.limit) params.set('limit', String(opts.limit));
  const res = await getJson<NichedbMatchResponse>(`${baseUrl}/api/v1/match?${params}`, opts);
  return res?.items ?? [];
}

/**
 * The title a release name refers to, or null when nichedb has no candidate at or
 * above the score floor. Prefers the row with a poster among exact titles.
 */
export async function matchTitle(
  name: string,
  opts: { year?: number | null } & NichedbClientOptions = {},
): Promise<NichedbTitleItem | null> {
  const items = await matchCandidates(name, opts);
  return pickMatch(items);
}

/**
 * The nichedb row for a known IMDb id.
 *
 * nichedb has no per-id tag (`tags=imdb:title:<tconst>` answers nothing) and the
 * items endpoint does not filter on external_id, so this goes through `match` on
 * the title we already know and keeps only rows carrying that tconst. Without a
 * title there is nothing to ask, and it answers null.
 */
export async function titleByImdbId(
  tconst: string,
  hint: { title?: string | null; year?: number | null } = {},
  opts: NichedbClientOptions = {},
): Promise<NichedbTitleItem | null> {
  if (!/^tt\d+$/.test(tconst) || !hint.title?.trim()) return null;
  const items = await matchCandidates(hint.title, { ...opts, year: hint.year ?? null, limit: 20 });
  return pickMatch(items, { imdbId: tconst });
}

/** One id-ordered page of `screen` titles; `after` is the last id already seen. */
export async function fetchTitlesPage(
  params: { after?: number; since?: string | null; limit?: number; tags?: string[] },
  opts: NichedbClientOptions = {},
): Promise<{ page: NichedbItemsPage; rateRemaining: number | null; status: number } | null> {
  const { baseUrl, fetch: doFetch, timeoutMs } = resolveOptions(opts);
  const qs = new URLSearchParams({
    collection: 'screen',
    kind: 'title',
    sort: 'id',
    order: 'asc',
    limit: String(params.limit ?? DEFAULT_PAGE_LIMIT),
  });
  if (params.after) qs.set('after', String(params.after));
  if (params.since) qs.set('since', params.since);
  if (params.tags?.length) qs.set('tags', params.tags.join(','));

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(timeoutMs, 30000)) : null;
  try {
    const res = await doFetch(`${baseUrl}/api/v1/items?${qs}`, {
      headers: { accept: 'application/json', 'user-agent': 'bittorrented.com (nichedb mirror)' },
      signal: controller?.signal,
    });
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    const rateRemaining = remaining != null && remaining !== '' ? Number(remaining) : null;
    if (!res.ok) return { page: { count: 0, items: [] }, rateRemaining, status: res.status };
    const page = (await res.json()) as NichedbItemsPage;
    return { page: { count: page.count ?? page.items?.length ?? 0, items: page.items ?? [] }, rateRemaining, status: res.status };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
