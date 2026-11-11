import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const getActiveProfileId = vi.fn();
const startResponse = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/lib/profiles/profile-utils', () => ({ getActiveProfileId: () => getActiveProfileId() }));
vi.mock('@/lib/logicsrc/grants', () => ({
  KEYS_PAGE: '/settings?tab=vault',
  siteOrigin: () => 'https://bittorrented.com',
  keyGrants: () => ({ startResponse }),
}));

import { GET } from './route';

const req = (q: string) => new NextRequest(new URL(`http://localhost:3000/api/v1/logicsrc/grant/start${q}`));

describe('GET /api/v1/logicsrc/grant/start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a signed-out visitor to /login and back', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(req('?keys=ALPACA_API_KEY'));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://bittorrented.com/login');
    expect(to.searchParams.get('redirect')).toBe('/api/v1/logicsrc/grant/start?keys=ALPACA_API_KEY');
    expect(startResponse).not.toHaveBeenCalled();
  });

  it('refuses key names bittorrented does not use', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    const res = await GET(req('?keys=OPENAI_API_KEY'));
    expect(res.headers.get('location')).toBe('https://bittorrented.com/settings?tab=vault&logicsrc=bad_key');
  });

  it('starts a request scoped to the active profile', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    getActiveProfileId.mockResolvedValue('p1');
    startResponse.mockResolvedValue(new Response(null, { status: 303 }));
    await GET(req(''));
    expect(startResponse).toHaveBeenCalledWith({
      userId: 'u1',
      keys: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
      next: '/settings?tab=vault',
      scope: 'p1',
      errorPath: '/settings?tab=vault',
    });
  });
});
