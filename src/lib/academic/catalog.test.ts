import { describe, expect, it } from 'vitest';
import { type Catalog, type CatalogEntry, type MirrorState, candidates, magnetFor, openFileDescriptor, planMirror } from './catalog';

const TB = 1e12;
const entry = (infohash: string, over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  infohash,
  title: infohash,
  category: 'Dataset',
  size: 1e9,
  license: { canonical: 'CC-BY-4.0', confidence: 'high' },
  verdict: 'attribution',
  reason: 'sellable with credit to the source',
  ...over,
});

const catalog: Catalog = {
  source: 'https://academictorrents.com/database.xml',
  fetchedAt: '2026-10-04T00:00:00Z',
  entries: [
    entry('course', { category: 'Course', size: 1e6 }),
    entry('big', { size: 5e11 }),
    entry('small', { size: 2e9 }),
    entry('nc', { verdict: 'no', license: { canonical: 'CC-BY-NC-SA-4.0', confidence: 'high' } }),
    entry('pd', { verdict: 'public-domain', license: { canonical: 'CC0-1.0', confidence: 'high' } }),
  ],
};
const empty: MirrorState = { capacityTb: 2, usedBytes: 1 * TB, mirrored: [] };

describe('candidates', () => {
  it('drops unsellable and mirrored entries, datasets first, smallest first', () => {
    const mirror = { ...empty, mirrored: [{ infohash: 'pd', sha256: 'aa', mirroredAt: '2026-10-04T00:00:00Z' }] };
    expect(candidates(catalog, mirror).map((e) => e.infohash)).toEqual(['small', 'big', 'course']);
  });
});

describe('webseeds', () => {
  it('puts entries with an HTTP source first and carries it in the magnet', () => {
    const withSeed: Catalog = { ...catalog, entries: [...catalog.entries, entry('seeded', { size: 9e11 / 10, webseeds: ['https://archive.org/download/'] })] };
    expect(candidates(withSeed, empty)[0].infohash).toBe('seeded');
    expect(magnetFor(withSeed.entries.at(-1)!)).toContain(`&ws=${encodeURIComponent('https://archive.org/download/')}`);
  });
});

describe('skipped', () => {
  it('rests a seederless torrent for a week, then tries it again', () => {
    const now = Date.parse('2026-10-10T00:00:00Z');
    const mirror = (at: string): MirrorState => ({ ...empty, skipped: [{ infohash: 'small', reason: 'no seeders', at }] });
    expect(candidates(catalog, mirror('2026-10-09T00:00:00Z'), now).map((e) => e.infohash)).not.toContain('small');
    expect(candidates(catalog, mirror('2026-10-01T00:00:00Z'), now).map((e) => e.infohash)).toContain('small');
  });
});

describe('planMirror', () => {
  it('fills the free part of the 2 TB rung', () => {
    const plan = planMirror(catalog, empty);
    expect(plan.rungTb).toBe(2);
    expect(plan.budget).toBe(0.8 * TB);
    expect(plan.picks.map((p) => p.infohash)).toContain('big');
    expect(plan.picks.map((p) => p.infohash)).not.toContain('nc');
  });
});

describe('planMirror with downloads in flight', () => {
  it('takes their bytes out of the budget and never picks them twice', () => {
    const big = catalog.entries.find((e) => e.infohash === 'big')!;
    const plan = planMirror(catalog, empty, [big]);
    expect(plan.budget).toBe(0.8 * TB - big.size);
    expect(plan.picks.map((p) => p.infohash)).not.toContain('big');
  });
});

describe('openFileDescriptor', () => {
  const access = { plans: [{ plan: 'premium', amountUsd: 4.99, per: 'year' as const }], signup: 'https://x/pricing' };

  it('lists only mirrored, sellable files with their basis and licence', () => {
    const mirror: MirrorState = {
      ...empty,
      mirrored: [
        { infohash: 'small', sha256: 'ab'.repeat(32), mirroredAt: '2026-10-05T00:00:00Z' },
        { infohash: 'pd', sha256: 'cd'.repeat(32), mirroredAt: '2026-10-05T00:00:00Z' },
        { infohash: 'nc', sha256: 'ef'.repeat(32), mirroredAt: '2026-10-05T00:00:00Z' },
      ],
    };
    const d = openFileDescriptor(catalog, mirror, 'https://bittorrented.com', access);
    expect(d.files.map((f) => f.name)).toEqual(['small', 'pd']);
    expect(d.files[0]).toMatchObject({ id: `sha256:${'ab'.repeat(32)}`, attestation: { basis: 'open-license', license: 'CC-BY-4.0' } });
    expect(d.files[1].attestation).toEqual({ basis: 'public-domain', source: 'https://academictorrents.com/details/pd' });
    expect(d.files[0]).not.toHaveProperty('price');
    expect(d.updated).toBe('2026-10-05T00:00:00Z');
  });

  it('is valid with nothing mirrored yet', () => {
    const d = openFileDescriptor(catalog, empty, 'https://bittorrented.com', access);
    expect(d.publisher.name).toBeTruthy();
    expect(d.files).toEqual([]);
  });
});
