import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /.well-known/openfile.json', () => {
  it('serves a valid OpenFile descriptor with yearly membership access', async () => {
    const res = GET(new NextRequest('https://bittorrented.com/.well-known/openfile.json'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publisher.name).toBeTruthy();
    expect(Array.isArray(body.files)).toBe(true);
    for (const f of body.files) {
      expect(f.id).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(['public-domain', 'open-license']).toContain(f.attestation.basis);
    }
    expect(body.bittorrented.access.plans).toEqual([
      { plan: 'premium', amountUsd: 4.99, per: 'year' },
      { plan: 'family', amountUsd: 9.99, per: 'year' },
    ]);
    expect(body.bittorrented.access.signup).toBe('https://bittorrented.com/pricing');
  });
});
