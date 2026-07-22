/**
 * Catalog sync: pull a provider's catalog from its source adapter into
 * `vod_titles` so browse/search is fast and doesn't hammer the provider.
 * Capped for v1; truncation is logged by the caller.
 */

import { resolveSource } from './config';
import * as adapters from './adapters';
import { enrichPosters } from './enrich';
import { VodError } from './errors';
import * as repo from './repository';

/** Max titles indexed per sync (v1 cap for very large catalogs). */
export const MAX_SYNC_TITLES = 5000;

export interface SyncResult {
  /** Titles returned by the source this run. */
  fetched: number;
  /** Titles actually processed + written (new ones only, unless `full`). */
  added: number;
  total: number;
  truncated: boolean;
  full: boolean;
  /** Posters filled from TMDB this run (0 when TMDB_API_KEY is unset). */
  enriched: number;
}

/**
 * Sync a provider's catalog into `vod_titles`.
 *
 * Incremental by default: the source has no delta API, so we still fetch its
 * full list in one call, but only **new** titles (external_ids not already
 * stored) are enriched + written — existing rows (and their posters) are left
 * untouched, so re-syncs are cheap and don't re-hit TMDB. Pass `full: true` to
 * re-process and upsert every title (picks up source-side metadata changes).
 */
export async function syncProviderCatalog(
  providerId: string,
  opts: { full?: boolean } = {}
): Promise<SyncResult> {
  const row = await repo.getProviderSourceRow(providerId);
  if (!row) throw new VodError('Provider not found', 404);
  const source = resolveSource(row);
  if (!source) throw new VodError('Provider source is not fully configured', 400);

  const items = await adapters.listCatalog(source, { limit: MAX_SYNC_TITLES });

  let toProcess = items;
  if (!opts.full) {
    const existing = await repo.getExistingExternalIds(providerId);
    toProcess = items.filter((i) => !existing.has(i.externalId));
  }

  // Best-effort: fill missing posters/plots from TMDB before persisting.
  const enriched = await enrichPosters(toProcess);
  await repo.upsertTitles(providerId, toProcess);
  const total = await repo.countTitles(providerId);
  await repo.setProviderSyncResult(providerId, total);

  return {
    fetched: items.length,
    added: toProcess.length,
    total,
    truncated: items.length >= MAX_SYNC_TITLES,
    full: Boolean(opts.full),
    enriched,
  };
}
