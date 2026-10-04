import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { datasetsFeed, type Catalog, type MirrorState } from '@/lib/academic/catalog';
import { ACADEMIC_LISTING } from '@/lib/academic/listing';
import { isPublicPath } from '@/proxy';
import catalog from '@/data/academic/catalog.json';
import mirror from '@/data/academic/mirror.json';
import { GET } from './route';

describe('GET /api/public/datasets', () => {
  it('is reachable without a session', () => {
    expect(isPublicPath('/api/public/datasets')).toBe(true);
  });

  it('lists nothing while the datasets are withdrawn, and says why', async () => {
    expect(ACADEMIC_LISTING.listed).toBe(false);
    const body = await GET(new NextRequest('https://bittorrented.com/api/public/datasets')).json();
    expect(body.datasets).toEqual([]);
    expect(body.withdrawn.reason).toMatch(/review/);
  });
});

describe('datasetsFeed (for when listing is turned back on)', () => {
  it('lists only licence-cleared datasets, with an OpenFile attestation each', () => {
    const feed = datasetsFeed(catalog as Catalog, mirror as MirrorState, 'https://bittorrented.com');
    expect(feed.spec).toBe('https://logicsrc.com/openfile');
    expect(feed.datasets.length).toBeGreaterThan(100);
    for (const d of feed.datasets) {
      expect(d.infohash).toMatch(/^[0-9a-f]{40}$/);
      expect(['public-domain', 'attribution', 'share-alike']).toContain(d.verdict);
      expect(['public-domain', 'open-license']).toContain(d.attestation.basis);
      if (d.attestation.basis === 'open-license') expect(d.attestation.license).toBeTruthy();
      expect(d.magnet).toContain(`xt=urn:btih:${d.infohash}`);
      if (d.mirrored) expect(d.mirrored.id).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});
