/**
 * Seeder counts from the Academic Torrents tracker (BEP 48 HTTP scrape).
 *
 * Most Academic Torrents swarms are dead. A torrent with nobody holding the
 * whole thing never finishes, and on the seedbox it holds one of torlnk's two
 * download slots while it fails to. The tracker's `complete` count is the
 * number of seeders it knows about, so the mirror only queues, and only keeps,
 * torrents where that is at least one.
 */

const TRACKER_SCRAPE = 'https://academictorrents.com/scrape.php';
const INFOHASH = /^[0-9a-f]{40}$/;

export interface ScrapeCounts {
  /** Peers holding the whole torrent. */
  complete: number;
  /** Peers still downloading. */
  incomplete: number;
}

/** Read the counts out of a scrape response; null when it is not one. */
export function parseScrape(body: Buffer | string): ScrapeCounts | null {
  const text = typeof body === 'string' ? body : body.toString('latin1');
  const complete = text.match(/8:completei(\d+)e/);
  const incomplete = text.match(/10:incompletei(\d+)e/);
  if (!complete) return null;
  return { complete: Number(complete[1]), incomplete: Number(incomplete?.[1] ?? 0) };
}

/** The info_hash query value: the raw 20 bytes, percent-encoded. */
export function encodeInfohash(infohash: string): string {
  if (!INFOHASH.test(infohash)) throw new Error('not a v1 infohash');
  return [...Buffer.from(infohash, 'hex')].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
}

export async function scrape(infohash: string): Promise<ScrapeCounts | null> {
  const url = new URL(TRACKER_SCRAPE);
  url.search = `info_hash=${encodeInfohash(infohash)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; bittorrented-dataset-mirror)' } });
  if (!res.ok) return null;
  return parseScrape(Buffer.from(await res.arrayBuffer()));
}

export function hasSeeders(counts: ScrapeCounts | null): boolean {
  return (counts?.complete ?? 0) > 0;
}
