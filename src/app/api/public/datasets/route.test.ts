import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isPublicPath } from '@/proxy';
import { GET } from './route';

describe('GET /api/public/datasets', () => {
  it('is reachable without a session', () => {
    expect(isPublicPath('/api/public/datasets')).toBe(true);
  });

  it('lists only licence-cleared datasets, with an OpenFile attestation each', async () => {
    const body = await GET(new NextRequest('https://bittorrented.com/api/public/datasets')).json();
    expect(body.spec).toBe('https://logicsrc.com/openfile');
    expect(body.datasets.length).toBeGreaterThan(100);
    for (const d of body.datasets) {
      expect(d.infohash).toMatch(/^[0-9a-f]{40}$/);
      expect(['public-domain', 'attribution', 'share-alike']).toContain(d.verdict);
      expect(['public-domain', 'open-license']).toContain(d.attestation.basis);
      if (d.attestation.basis === 'open-license') expect(d.attestation.license).toBeTruthy();
      expect(d.magnet).toContain(`xt=urn:btih:${d.infohash}`);
      if (d.mirrored) expect(d.mirrored.id).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});
