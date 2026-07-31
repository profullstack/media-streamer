/**
 * Stale-record cleanup.
 *
 * torlink keeps a torrent's record forever — across restarts, and long after
 * its data was deleted out from under the daemon. The status page hides those
 * ghosts (see {@link isStaleTorrent}), but hiding them doesn't shrink torlink's
 * own list: it kept reporting 63 torrents for a box that only had 39 on disk.
 *
 * This drops the dead records via torlink's control API:
 *   POST /control { id, action: 'remove' }  ->  200 {ok:true} | 404 no such torrent
 *
 * We always use `remove`, never `delete`. `delete` asks torlink to unlink the
 * files too; `remove` only forgets the record. Since we exclusively prune
 * torrents whose files are already gone, `remove` is sufficient — and it means
 * a bug in the staleness check can never destroy real data.
 */

import type { SeedboxConfig, SeedboxHttpConfig } from './config';
import { buildAuthHeaders } from './http-transport';
import { listOnDiskNames } from './files';
import { isStaleTorrent } from './torlink-reconcile';

export interface StaleTorrent {
  id: string;
  name: string;
  status: string;
}

export interface CleanupResult {
  /** Records torlink confirmed it dropped. */
  removed: StaleTorrent[];
  /** Stale records torlink refused or failed to drop. */
  failed: { name: string; reason: string }[];
  /** Set when nothing was attempted, explaining why. */
  skipped: string | null;
}

interface StatusEntry {
  id?: string;
  name?: string;
  status?: string;
}

const STATUS_TIMEOUT_MS = 8000;
const CONTROL_TIMEOUT_MS = 8000;

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask torlink to forget one torrent, keeping any files. */
async function removeTorrent(
  http: SeedboxHttpConfig,
  id: string,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; reason: string }> {
  const url = `${http.baseUrl.replace(/\/+$/, '')}/control`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(http) },
      body: JSON.stringify({ id, action: 'remove' }),
      signal: controller.signal,
    });
    // 404 means torlink already doesn't have it — the desired end state, so
    // treat it as success rather than surfacing noise the user can't act on.
    if (res.status === 404) return { ok: true, reason: 'already gone' };
    if (!res.ok) return { ok: false, reason: `torlink returned ${res.status}` };
    return { ok: true, reason: 'removed' };
  } catch {
    return { ok: false, reason: 'could not reach torlink' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drop every torlink record whose data is provably gone.
 *
 * Refuses to do anything unless the on-disk listing was read successfully and
 * is non-empty — without trustworthy ground truth, "not on disk" could mean
 * "the file server is misconfigured", and pruning on that would erase the box's
 * entire torrent list.
 */
export async function cleanupStaleTorrents(
  config: SeedboxConfig,
  fetchImpl: typeof fetch = fetch
): Promise<CleanupResult> {
  const empty: CleanupResult = { removed: [], failed: [], skipped: null };
  if (!config.http) return { ...empty, skipped: 'No torlink API is configured' };

  const onDisk = await listOnDiskNames(config.files, fetchImpl);
  if (onDisk === null) {
    return {
      ...empty,
      skipped:
        'Could not list the seedbox files, so there is no way to tell which records are stale',
    };
  }
  if (onDisk.length === 0) {
    return {
      ...empty,
      skipped:
        'The seedbox file listing came back empty — refusing to prune, since that looks like a misconfigured file server rather than an empty box',
    };
  }

  const statusUrl = `${config.http.baseUrl.replace(/\/+$/, '')}/status`;
  const status = await getJson<{ downloads?: StatusEntry[]; seeds?: StatusEntry[] }>(
    statusUrl,
    buildAuthHeaders(config.http),
    STATUS_TIMEOUT_MS,
    fetchImpl
  );
  if (!status) return { ...empty, skipped: 'Could not read torlink status' };

  const entries = [
    ...(Array.isArray(status.downloads) ? status.downloads : []),
    ...(Array.isArray(status.seeds) ? status.seeds : []),
  ];
  const stale: StaleTorrent[] = entries
    .map((e) => ({
      id: (e.id ?? '').toLowerCase(),
      name: e.name ?? '',
      status: e.status ?? '',
    }))
    // No id ⇒ nothing to address the control call to.
    .filter((e) => e.id.length > 0)
    .filter((e) => isStaleTorrent(e.status, e.name, onDisk));

  const removed: StaleTorrent[] = [];
  const failed: { name: string; reason: string }[] = [];
  // Sequential on purpose: this is a cleanup, not a race to finish, and firing
  // dozens of concurrent control calls at a daemon we already know can wedge is
  // how you turn a tidy-up into an outage.
  for (const torrent of stale) {
    const result = await removeTorrent(config.http, torrent.id, fetchImpl);
    if (result.ok) removed.push(torrent);
    else failed.push({ name: torrent.name || torrent.id, reason: result.reason });
  }

  return { removed, failed, skipped: null };
}
