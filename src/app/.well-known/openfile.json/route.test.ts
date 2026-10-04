import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /.well-known/openfile.json', () => {
  it('serves a valid OpenFile descriptor with yearly membership access', async () => {
    const res = GET(new NextRequest('https://bittorrented.com/.well-known/openfile.json'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Withdrawn 2026-10-04: a valid descriptor with no files and the reason beside it.
    expect(body.files).toEqual([]);
    expect(body.bittorrented.withdrawn.listed).toBe(false);
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

  afterEach(() => vi.unstubAllEnvs());

  it('advertises the public app URL, not the proxy origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bittorrented.com');
    const body = await GET(new NextRequest('https://localhost:3000/.well-known/openfile.json')).json();
    expect(body.publisher.web).toBe('https://bittorrented.com');
    expect(body.bittorrented.access.signup).toBe('https://bittorrented.com/pricing');
  });
});
