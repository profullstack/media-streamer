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
 * Keep only torrents that reflect the seedbox's *current* state:
 *  - drop torlink's `missing` records (data confirmed gone),
 *  - always keep active transfers (downloading / queued) — inherently realtime,
 *  - for the rest (seeding / paused / failed) keep only if the files are still
 *    on disk.
 *
 * `onDiskNames === null` means the listing couldn't be fetched, so we can't
 * reconcile — fail open and keep the item rather than hide a real one.
 */
export function isLiveTorrent(status: string, name: string, onDiskNames: string[] | null): boolean {
  if (status === 'missing') return false;
  if (status === 'downloading' || status === 'queued') return true;
  if (onDiskNames === null) return true;
  return isOnDisk(name, onDiskNames);
}
