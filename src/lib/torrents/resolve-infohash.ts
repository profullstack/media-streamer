/**
 * Torrent identity helpers
 *
 * A torrent detail URL (/torrents/:id) carries either a bt_torrents UUID or a
 * 40-char infohash, depending on which listing linked to it. Features that are
 * keyed on the infohash — comments, for example — need to collapse both forms
 * down to the infohash so that DHT and indexed torrents behave identically.
 */

import { getTorrentById } from '@/lib/supabase/queries';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INFOHASH_REGEX = /^[0-9a-f]{40}$/i;

/**
 * Check if a string is a bt_torrents UUID
 */
export function isUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Check if a string is a BitTorrent v1 infohash (40 hex chars)
 */
export function isInfohash(str: string): boolean {
  return INFOHASH_REGEX.test(str);
}

/**
 * Resolve a torrent detail route param to a normalized (lowercase) infohash.
 *
 * Accepts an infohash directly, or a bt_torrents UUID which is looked up.
 * Returns null when the param is neither, or when a UUID has no matching row.
 *
 * Note: an infohash is returned without verifying the torrent exists anywhere.
 * DHT torrents live in Bitmagnet's tables rather than bt_torrents, and a swarm
 * is addressable by infohash whether or not either index knows about it.
 */
export async function resolveInfohash(id: string): Promise<string | null> {
  const trimmed = id?.trim();
  if (!trimmed) return null;

  if (isInfohash(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (isUUID(trimmed)) {
    const torrent = await getTorrentById(trimmed);
    return torrent?.infohash ? torrent.infohash.toLowerCase() : null;
  }

  return null;
}
