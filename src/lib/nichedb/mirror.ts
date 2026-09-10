/**
 * nichedb `screen` -> imdb_title_basics / imdb_title_ratings.
 *
 * Pure pieces of scripts/mirror-imdb-from-nichedb.ts: the row mapping and the
 * cursor walk, with the network, the store and the clock injected so they can be
 * exercised against fixtures.
 *
 * The walk is id-ordered. A run starts from the cursor's `after_id` and sends the
 * cursor's `since` with every page; when it reaches the end it resets `after_id`
 * to 0 and sets `since` to the moment this walk began, so the next run only asks
 * for items nichedb updated after that. A run that stops early (page cap, network
 * error, rate limit) leaves `after_id` where it got to and keeps the same `since`,
 * so the next run carries on from there.
 */

import { fetchTitlesPage, imdbIdOf, type NichedbClientOptions, type NichedbTitleItem } from './titles';

export const MIRROR_CURSOR_NAME = 'imdb-titles';

/** imdb_title_basics row, the columns the dump import fills. */
export interface ImdbBasicsRow {
  tconst: string;
  title_type: string | null;
  primary_title: string | null;
  original_title: string | null;
  is_adult: boolean | null;
  start_year: number | null;
  end_year: number | null;
  runtime_minutes: number | null;
  genres: string | null;
}

/** imdb_title_ratings row. */
export interface ImdbRatingsRow {
  tconst: string;
  average_rating: number;
  num_votes: number;
}

export interface MirrorCursor {
  after_id: number;
  since: string | null;
}

export interface MirrorRows {
  /** From IMDb-sourced rows: authoritative, upserted (overwrite). */
  basics: ImdbBasicsRow[];
  /** From other providers that know the tconst: insert-only, fills gaps but never overwrites. */
  basicsFill: ImdbBasicsRow[];
  /** Only IMDb's own rating goes into imdb_title_ratings; TMDB/TVmaze ratings are a different scale. */
  ratings: ImdbRatingsRow[];
}

const FORM_TO_TITLE_TYPE: Record<string, string> = { movie: 'movie', series: 'tvSeries' };

function intOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Map one nichedb title to an imdb_title_basics row, or null when it has no tconst. */
export function titleToBasics(item: NichedbTitleItem): ImdbBasicsRow | null {
  const tconst = imdbIdOf(item);
  if (!tconst) return null;
  const d = item.data ?? {};
  const titleType = (typeof d.titleType === 'string' && d.titleType) || FORM_TO_TITLE_TYPE[d.form ?? ''] || null;
  const genres = Array.isArray(d.genres) ? d.genres.filter((g): g is string => typeof g === 'string' && g.length > 0) : [];
  return {
    tconst,
    title_type: titleType,
    primary_title: item.title ?? null,
    original_title: (typeof d.originalTitle === 'string' && d.originalTitle) || item.title || null,
    is_adult: typeof d.isAdult === 'boolean' ? d.isAdult : null,
    start_year: intOrNull(d.year),
    end_year: intOrNull(d.endYear),
    runtime_minutes: intOrNull(d.runtimeMin),
    // The dump stores genres as a bare comma list ("Action,Sci-Fi"); readers
    // re-space it themselves (enrich.ts: genres.replace(/,/g, ', ')).
    genres: genres.length ? genres.join(',') : null,
  };
}

/** Map an IMDb-sourced nichedb title to an imdb_title_ratings row, or null when unrated. */
export function titleToRatings(item: NichedbTitleItem): ImdbRatingsRow | null {
  const tconst = imdbIdOf(item);
  if (!tconst) return null;
  const d = item.data ?? {};
  const rating = typeof d.rating === 'number' ? d.rating : Number(d.rating);
  const votes = intOrNull(d.ratingCount);
  if (!Number.isFinite(rating) || votes == null) return null;
  return { tconst, average_rating: Math.round(rating * 10) / 10, num_votes: votes };
}

export function isImdbSourced(item: NichedbTitleItem): boolean {
  return item.data?.provider === 'imdb' || /^imdb:title:/.test(item.external_id ?? '');
}

/** Split a page of titles into the rows to write. Items without a tconst are skipped. */
export function pageToRows(items: NichedbTitleItem[]): MirrorRows {
  const basics = new Map<string, ImdbBasicsRow>();
  const basicsFill = new Map<string, ImdbBasicsRow>();
  const ratings = new Map<string, ImdbRatingsRow>();
  for (const item of items) {
    const row = titleToBasics(item);
    if (!row) continue;
    if (isImdbSourced(item)) {
      basics.set(row.tconst, row);
      basicsFill.delete(row.tconst);
      const r = titleToRatings(item);
      if (r) ratings.set(r.tconst, r);
    } else if (!basics.has(row.tconst)) {
      basicsFill.set(row.tconst, row);
    }
  }
  return { basics: [...basics.values()], basicsFill: [...basicsFill.values()], ratings: [...ratings.values()] };
}

export interface MirrorStore {
  loadCursor(name: string): Promise<MirrorCursor | null>;
  saveCursor(name: string, cursor: MirrorCursor): Promise<void>;
  writeRows(rows: MirrorRows): Promise<void>;
}

export interface MirrorRunOptions extends NichedbClientOptions {
  store: MirrorStore;
  /** Pages this run may fetch; 0 = until the walk completes. */
  maxPages: number;
  /** Pause between pages. 600 req/h is one every 6 s; leave room for the site's own calls. */
  intervalMs: number;
  pageLimit?: number;
  /** Restrict the walk, e.g. ['imdb'] for IMDb-sourced rows only. */
  tags?: string[];
  cursorName?: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** How many times to wait out a 429 before giving up this run. */
  maxRateLimitWaits?: number;
}

export interface MirrorRunResult {
  pages: number;
  items: number;
  basics: number;
  basicsFill: number;
  ratings: number;
  completed: boolean;
  cursor: MirrorCursor;
  stoppedBecause: 'completed' | 'page-cap' | 'network' | 'rate-limit' | 'http';
}

/**
 * Walk the collection from the stored cursor, writing rows page by page and
 * advancing the cursor after each page so a crash loses at most one page of work
 * (which the next run re-fetches; the upserts are idempotent).
 */
export async function runMirror(opts: MirrorRunOptions): Promise<MirrorRunResult> {
  const name = opts.cursorName ?? MIRROR_CURSOR_NAME;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});
  const pageLimit = opts.pageLimit ?? 200;
  const maxRateLimitWaits = opts.maxRateLimitWaits ?? 3;

  const startedAt = now().toISOString();
  const cursor: MirrorCursor = (await opts.store.loadCursor(name)) ?? { after_id: 0, since: null };
  log(`cursor ${name}: after_id=${cursor.after_id} since=${cursor.since ?? 'none'} (walk started ${startedAt})`);

  const result: MirrorRunResult = {
    pages: 0, items: 0, basics: 0, basicsFill: 0, ratings: 0,
    completed: false, cursor, stoppedBecause: 'page-cap',
  };
  let rateLimitWaits = 0;

  while (opts.maxPages === 0 || result.pages < opts.maxPages) {
    const fetched = await fetchTitlesPage(
      { after: cursor.after_id, since: cursor.since, limit: pageLimit, tags: opts.tags },
      opts,
    );
    if (!fetched) {
      result.stoppedBecause = 'network';
      log('network error; stopping, cursor kept');
      break;
    }
    if (fetched.status === 429) {
      if (rateLimitWaits++ >= maxRateLimitWaits) {
        result.stoppedBecause = 'rate-limit';
        log('rate limited too many times; stopping, cursor kept');
        break;
      }
      log('rate limited (429); waiting 60s');
      await sleep(60_000);
      continue;
    }
    if (fetched.status >= 400) {
      result.stoppedBecause = 'http';
      log(`HTTP ${fetched.status}; stopping, cursor kept`);
      break;
    }

    result.pages += 1;
    const items = fetched.page.items;
    if (items.length > 0) {
      const rows = pageToRows(items);
      await opts.store.writeRows(rows);
      result.items += items.length;
      result.basics += rows.basics.length;
      result.basicsFill += rows.basicsFill.length;
      result.ratings += rows.ratings.length;
      cursor.after_id = items[items.length - 1].id;
      await opts.store.saveCursor(name, { ...cursor });
      log(`page ${result.pages}: ${items.length} items -> ${rows.basics.length} basics, ${rows.basicsFill.length} fill, ${rows.ratings.length} ratings; after_id=${cursor.after_id}${fetched.rateRemaining != null ? ` (rate remaining ${fetched.rateRemaining})` : ''}`);
    }

    if (items.length < pageLimit) {
      // End of the walk: next run asks only for what changed since this one began.
      cursor.after_id = 0;
      cursor.since = startedAt;
      await opts.store.saveCursor(name, { ...cursor });
      result.completed = true;
      result.stoppedBecause = 'completed';
      log(`walk complete; next run uses since=${startedAt}`);
      break;
    }

    if (fetched.rateRemaining != null && fetched.rateRemaining <= 1) {
      log('rate budget exhausted; waiting 60s');
      await sleep(60_000);
    } else {
      await sleep(opts.intervalMs);
    }
  }

  result.cursor = { ...cursor };
  return result;
}
