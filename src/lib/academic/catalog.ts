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

export interface MirrorState {
  capacityTb: number;
  usedBytes: number;
  mirrored: MirroredEntry[];
}

const CATEGORY_ORDER: Record<string, number> = { Dataset: 0, Course: 1 };

/** Sellable entries not yet mirrored, datasets before courses, smallest first. */
export function candidates(catalog: Catalog, mirror: MirrorState): CatalogEntry[] {
  const have = new Set(mirror.mirrored.map((m) => m.infohash));
  return catalog.entries
    .filter((e) => isSellable(e.verdict) && !have.has(e.infohash))
    .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9) || a.size - b.size);
}

export interface MirrorPlan {
  rungTb: number;
  budget: number;
  picks: CatalogEntry[];
  bytes: number;
}

export function planMirror(catalog: Catalog, mirror: MirrorState): MirrorPlan {
  const rungTb = rungFor(mirror.capacityTb);
  const budget = budgetBytes(rungTb, mirror.usedBytes);
  const picks = fillBudget(candidates(catalog, mirror), budget);
  return { rungTb, budget, picks, bytes: picks.reduce((n, p) => n + p.size, 0) };
}

export function magnetFor(entry: Pick<CatalogEntry, 'infohash' | 'title'>): string {
  const dn = encodeURIComponent(entry.title);
  return `magnet:?xt=urn:btih:${entry.infohash}&dn=${dn}&tr=${encodeURIComponent('https://academictorrents.com/announce.php')}&tr=${encodeURIComponent('udp://tracker.opentrackr.org:1337/announce')}`;
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
