/**
 * Catalog sync: pull a provider's catalog from its source adapter into
 * `vod_titles` so browse/search is fast and doesn't hammer the provider.
 * Capped for v1; truncation is logged by the caller.
 */

import { resolveSource } from './config';
import * as adapters from './adapters';
import { VodError } from './errors';
import * as repo from './repository';

/** Max titles indexed per sync (v1 cap for very large catalogs). */
export const MAX_SYNC_TITLES = 5000;

export interface SyncResult {
  fetched: number;
  total: number;
  truncated: boolean;
}

export async function syncProviderCatalog(providerId: string): Promise<SyncResult> {
  const row = await repo.getProviderSourceRow(providerId);
  if (!row) throw new VodError('Provider not found', 404);
  const source = resolveSource(row);
  if (!source) throw new VodError('Provider source is not fully configured', 400);

  const items = await adapters.listCatalog(source, { limit: MAX_SYNC_TITLES });
  await repo.upsertTitles(providerId, items);
  const total = await repo.countTitles(providerId);
  await repo.setProviderSyncResult(providerId, total);

  return { fetched: items.length, total, truncated: items.length >= MAX_SYNC_TITLES };
}
