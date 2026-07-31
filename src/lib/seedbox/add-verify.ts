/**
 * Post-add verification.
 *
 * torlink's `/add` answers `200 {"ok":true,"outcome":"added"}` the moment it
 * accepts a magnet — *before* anything is queued, and without checking that the
 * queue accepted it. A daemon whose client is wedged (or whose queue never
 * restarts an item) therefore reports a perfectly healthy "added" for a torrent
 * it then silently drops on the floor. Observed in production: two magnets came
 * back `added`, never appeared in `/status`, and never hit disk — the send UI
 * showed success while nothing happened, which is the worst possible outcome
 * because there is nothing to retry and nothing to see.
 *
 * So a 2xx from `/add` is treated as a *claim*, not a result: we re-read
 * `/status` and only report success once the torrent is genuinely there.
 */

import type { SeedboxHttpConfig } from './config';
import { buildAuthHeaders } from './http-transport';

/**
 * - `registered` — torlink is tracking it; the add really worked.
 * - `missing`    — torlink claimed success but does not have it. A real bug.
 * - `unknown`    — we could not check (status unreachable/unparseable, or no
 *                  infohash to match on). Callers MUST fail open here: never
 *                  report a working send as broken on the strength of a failed
 *                  verification.
 */
export type VerifyOutcome = 'registered' | 'missing' | 'unknown';

export interface VerifyOptions {
  /** How many times to re-read /status before giving up. */
  attempts?: number;
  /** Delay between attempts, in ms. */
  delayMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable for tests so they don't spend real time sleeping. */
  sleep?: (ms: number) => Promise<void>;
}

interface StatusEntry {
  id?: string;
  name?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** One read of /status. Returns null when it can't be read or parsed. */
async function readStatusEntries(
  config: SeedboxHttpConfig,
  fetchImpl: typeof fetch
): Promise<StatusEntry[] | null> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetchImpl(url, {
      headers: buildAuthHeaders(config),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { downloads?: StatusEntry[]; seeds?: StatusEntry[] };
    const downloads = Array.isArray(json.downloads) ? json.downloads : [];
    const seeds = Array.isArray(json.seeds) ? json.seeds : [];
    return [...downloads, ...seeds];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether `/status` lists this torrent. Matching is by infohash (torlink's `id`)
 * and falls back to an exact name match, because a torrent added from a magnet
 * can briefly appear under its display name before metadata resolves — and a
 * false "missing" is worse than a missed detection.
 */
function isPresent(entries: StatusEntry[], infohash: string, name: string): boolean {
  const wantedName = name.trim().toLowerCase();
  return entries.some((entry) => {
    if ((entry.id ?? '').toLowerCase() === infohash) return true;
    return wantedName.length > 0 && (entry.name ?? '').trim().toLowerCase() === wantedName;
  });
}

/**
 * Re-read `/status` until the torrent shows up, or we run out of attempts.
 *
 * torlink enqueues synchronously on a healthy daemon, so this normally succeeds
 * on the first read; the retries exist only to absorb a slow restore on a busy
 * box. Any inability to check yields `unknown`, never `missing`.
 */
export async function verifyTorrentRegistered(
  config: SeedboxHttpConfig,
  infohash: string | null,
  name: string,
  options: VerifyOptions = {}
): Promise<VerifyOutcome> {
  if (!infohash) return 'unknown';
  const attempts = options.attempts ?? 4;
  const delayMs = options.delayMs ?? 700;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const entries = await readStatusEntries(config, fetchImpl);
    // Unreadable status ⇒ we have no evidence either way. Stop immediately
    // rather than retrying: the verdict would be `unknown` regardless, and
    // spending seconds re-polling a dead endpoint only delays the send.
    if (entries === null) return 'unknown';
    if (isPresent(entries, infohash, name)) return 'registered';
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  // We read the list, repeatedly, and it genuinely isn't there.
  return 'missing';
}

/**
 * The message shown when torlink accepted a magnet but never registered it.
 * Deliberately specific: the user's instinct is to retry the send, and retrying
 * will produce the same silent success, so point at the daemon instead.
 */
export const ADD_DROPPED_MESSAGE =
  'Seedbox accepted the torrent but never registered it — the torlink daemon is ' +
  'wedged and is silently dropping adds. Restart it (Setup → Install torlink & ' +
  'open ports), then send again.';
