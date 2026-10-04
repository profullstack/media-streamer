/**
 * The Academic Torrents dataset mirror: what we may sell, what fits, and the
 * OpenFile descriptor members and directories read.
 *
 * Two files under src/data/academic drive it, both written by scripts:
 *   - catalog.json  every Dataset and Course on academictorrents.com with its
 *                   licence and verdict (scripts/academic-catalog.ts)
 *   - mirror.json   the rung we are on, space used, and what is mirrored with
 *                   its content hash (scripts/academic-mirror.ts)
 */

import { type AcademicLicense, type LicenseVerdict, isSellable, openFileBasis } from './license';
import { budgetBytes, fillBudget, rungFor } from './ladder';

export interface CatalogEntry {
  infohash: string;
  title: string;
  category: 'Dataset' | 'Course' | string;
  size: number;
  license: AcademicLicense | null;
  verdict: LicenseVerdict;
  reason: string;
  /** HTTP sources from the .torrent's url-list (often archive.org); absent when it has none. */
  webseeds?: string[];
}

export interface Catalog {
  source: string;
  fetchedAt: string;
  entries: CatalogEntry[];
}

export interface MirroredEntry {
  infohash: string;
  /**
   * SHA-256 of the dataset's files concatenated in byte-sorted path order
   * (`find -type f -print0 | LC_ALL=C sort -z | xargs -0 cat | sha256sum`).
   * OpenFile requires a content hash as the id; this is the deterministic one
   * for a multi-file torrent.
   */
  sha256: string;
  mirroredAt: string;
}

/** A torrent dropped for having no seeders; retried once {@link SKIP_RETRY_MS} has passed. */
export interface SkippedEntry {
  infohash: string;
  reason: string;
  at: string;
}

export interface MirrorState {
  capacityTb: number;
  usedBytes: number;
  mirrored: MirroredEntry[];
  skipped?: SkippedEntry[];
}

/** Seeders come back; a dead torrent is worth one more look after a week. */
export const SKIP_RETRY_MS = 7 * 24 * 3600 * 1000;

const CATEGORY_ORDER: Record<string, number> = { Dataset: 0, Course: 1 };

/**
 * Sellable entries not yet mirrored, in the order worth fetching: anything with
 * an HTTP webseed first (most Academic Torrents swarms are near dead, and a
 * torlnk slot held by a stalled swarm blocks the queue), then datasets before
 * courses, then smallest first.
 */
export function candidates(catalog: Catalog, mirror: MirrorState, now = Date.now()): CatalogEntry[] {
  const have = new Set(mirror.mirrored.map((m) => m.infohash));
  const resting = new Set(
    (mirror.skipped ?? []).filter((s) => now - Date.parse(s.at) < SKIP_RETRY_MS).map((s) => s.infohash)
  );
  return catalog.entries
    .filter((e) => isSellable(e.verdict) && !have.has(e.infohash) && !resting.has(e.infohash))
    .sort(
      (a, b) =>
        Number(!a.webseeds?.length) - Number(!b.webseeds?.length) ||
        (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9) ||
        a.size - b.size
    );
}

export interface MirrorPlan {
  rungTb: number;
  budget: number;
  picks: CatalogEntry[];
  bytes: number;
}

/**
 * What to fetch next. `inFlight` is what is already queued or downloading:
 * its bytes come out of the budget (partly downloaded ones are counted twice,
 * which errs on the side of room) and it is never picked again.
 */
export function planMirror(catalog: Catalog, mirror: MirrorState, inFlight: readonly CatalogEntry[] = []): MirrorPlan {
  const rungTb = rungFor(mirror.capacityTb);
  const queued = new Set(inFlight.map((e) => e.infohash));
  const budget = Math.max(0, budgetBytes(rungTb, mirror.usedBytes) - inFlight.reduce((n, e) => n + e.size, 0));
  const picks = fillBudget(
    candidates(catalog, mirror).filter((e) => !queued.has(e.infohash)),
    budget
  );
  return { rungTb, budget, picks, bytes: picks.reduce((n, p) => n + p.size, 0) };
}

export function magnetFor(entry: Pick<CatalogEntry, 'infohash' | 'title' | 'webseeds'>): string {
  const dn = encodeURIComponent(entry.title);
  const ws = (entry.webseeds ?? []).map((u) => `&ws=${encodeURIComponent(u)}`).join('');
  return `magnet:?xt=urn:btih:${entry.infohash}&dn=${dn}&tr=${encodeURIComponent('https://academictorrents.com/announce.php')}&tr=${encodeURIComponent('udp://tracker.opentrackr.org:1337/announce')}${ws}`;
}

export interface MembershipAccess {
  plans: { plan: string; amountUsd: number; per: 'year' }[];
  signup: string;
}

/**
 * The OpenFile descriptor (logicsrc.com/openfile) for every mirrored dataset
 * whose licence lets us sell it.
 *
 * Only mirrored entries are listed, because OpenFile's id is the SHA-256 of the
 * bytes and Academic Torrents publishes only the v1 infohash; we know the hash
 * once the bytes are on our disk. Access is a bittorrented membership, which
 * OpenFile's `price.per` (key | gib | fetch) has no word for, so it travels
 * under our own `bittorrented` key; `price` stays absent rather than claim free.
 */
export function openFileDescriptor(catalog: Catalog, mirror: MirrorState, origin: string, access: MembershipAccess) {
  const byHash = new Map(catalog.entries.map((e) => [e.infohash, e]));
  const files = mirror.mirrored.flatMap((m) => {
    const entry = byHash.get(m.infohash);
    const basis = entry ? openFileBasis(entry.verdict) : null;
    // A licence can be withdrawn upstream; a re-crawl that flips it to `no` delists it here.
    if (!entry || !basis) return [];
    return [
      {
        id: `sha256:${m.sha256}`,
        name: entry.title,
        url: `https://academictorrents.com/details/${entry.infohash}`,
        size: entry.size,
        swarm: { infohashV1: `sha1:${entry.infohash}`, private: false },
        encryption: 'none',
        fetch: [{ kind: 'magnet', url: magnetFor(entry) }],
        attestation: {
          basis,
          ...(basis === 'open-license' && entry.license?.canonical ? { license: entry.license.canonical } : {}),
          source: `https://academictorrents.com/details/${entry.infohash}`,
        },
        bittorrented: { access: 'members', category: entry.category, verdict: entry.verdict, note: entry.reason },
        updated: m.mirroredAt,
      },
    ];
  });
  const updated = [catalog.fetchedAt, ...mirror.mirrored.map((m) => m.mirroredAt)].sort().at(-1);
  return {
    publisher: {
      name: 'bittorrented.com dataset mirror',
      web: origin,
      hubs: [`${origin}/api/openswarm`],
    },
    updated,
    bittorrented: { access },
    files,
  };
}
