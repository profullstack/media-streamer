/**
 * Torlink status reconciliation.
 *
 * torlink's `/status` reports its *persisted* view: it keeps seed records across
 * restarts (restored from history) and only flips a torrent to status "missing"
 * after its own stray-detection fires. So a torrent whose files were deleted out
 * from under the daemon can linger as "seeding" (or reappear after a restart).
 *
 * To show *current* reality we reconcile that list against the seedbox file
 * server's live directory listing (the same dir torlink seeds from): a seeding
 * torrent is only real if its data is still on disk.
 */

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Whether a torrent's data still exists on disk, matched by top-level name.
 * torlink saves each torrent as `<name>` (single file) or `<name>/…` (folder)
 * under the download dir, so the torrent name equals a top-level entry name.
 * Matching is lenient (prefix either way) to tolerate an extension on one side,
 * because a false "not on disk" would wrongly hide a genuinely-seeding torrent.
 */
export function isOnDisk(name: string, onDiskNames: string[]): boolean {
  const n = norm(name);
  if (!n) return false;
  return onDiskNames.some((entry) => {
    const e = norm(entry);
    return e === n || e.startsWith(n) || n.startsWith(e);
  });
}

/**
 * States that describe live activity rather than stored data. None of these
 * imply anything is on disk yet, so they must never be disk-reconciled.
 *
 * `failed` belongs here despite not being "active": a torrent that errored has
 * no files by definition, so requiring files on disk hid every failure. That
 * made a torrent added successfully but unable to start simply *vanish* from
 * the page — the single most confusing way this can break, and precisely the
 * state you most need to see. Surfacing it is the whole point.
 */
const DISK_BACKED = new Set(['seeding', 'paused']);

/**
 * Keep only torrents that reflect the seedbox's *current* state:
 *  - drop torlink's `missing` records (data confirmed gone),
 *  - always keep in-flight or errored torrents — none of them have files yet,
 *  - for stored torrents (seeding / paused) keep only if the files are still
 *    on disk.
 *
 * `onDiskNames === null` means the listing couldn't be fetched, so we can't
 * reconcile — fail open and keep the item rather than hide a real one.
 */
/**
 * Whether a torrent is a *stale record*: torlink still tracks it, but its data
 * is provably gone, so the record is safe to drop.
 *
 * This is deliberately stricter than `!isLiveTorrent`, because being wrong here
 * destroys a record instead of merely hiding a row:
 *  - the disk listing must have been read successfully, AND
 *  - it must be non-empty. An empty listing is indistinguishable from a file
 *    server pointed at the wrong directory, and pruning against it would wipe
 *    every torrent on the box.
 *  - only stored states (seeding/paused) and torlink's own `missing` verdict
 *    qualify. An in-flight or failed torrent has no files *yet* and must never
 *    be pruned for it.
 */
export function isStaleTorrent(
  status: string,
  name: string,
  onDiskNames: string[] | null
): boolean {
  if (onDiskNames === null || onDiskNames.length === 0) return false;
  if (status === 'missing') return true;
  if (!DISK_BACKED.has(status)) return false;
  return !isOnDisk(name, onDiskNames);
}

export function isLiveTorrent(status: string, name: string, onDiskNames: string[] | null): boolean {
  if (status === 'missing') return false;
  // Reconcile ONLY the states that imply stored data. Anything else — including
  // a status this code has never heard of — is shown. Allow-listing the visible
  // states instead would make any new torlink status silently disappear, which
  // is the failure mode this whole filter keeps producing.
  if (!DISK_BACKED.has(status)) return true;
  if (onDiskNames === null) return true;
  return isOnDisk(name, onDiskNames);
}
