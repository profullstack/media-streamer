import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const user = vi.fn();
const admin = vi.fn();
const mint = vi.fn();
const list = vi.fn();

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: () => user() }));
vi.mock('@/lib/admin', () => ({ checkUserAdmin: () => admin() }));
vi.mock('@/lib/rewards', () => ({
  mintPremiumCode: (o: unknown) => mint(o),
  getCredits: () => ({ list, revoke: vi.fn() }),
}));

const { GET, POST } = await import('./route');
const req = (method: string, body?: unknown) =>
  new NextRequest('https://bittorrented.com/api/admin/credit-codes', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });

describe('/api/admin/credit-codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.mockResolvedValue({ id: 'admin1', email: 'a@b.c' });
    admin.mockResolvedValue({ isAdmin: true });
  });

  it('is invisible to members', async () => {
    admin.mockResolvedValue({ isAdmin: false });
    expect((await GET(req('GET'))).status).toBe(404);
    expect((await POST(req('POST', { days: 30 }))).status).toBe(404);
    expect(mint).not.toHaveBeenCalled();
  });

  it('mints a Premium-days code for an admin', async () => {
    mint.mockResolvedValue({ code: 'BT-AAAA-BBBB-CCCC-DDDD', id: 'c1' });
    const res = await POST(req('POST', { days: 30, label: 'for Sam', maxRedemptions: 2 }));
    expect(res.status).toBe(201);
    expect((await res.json()).code).toBe('BT-AAAA-BBBB-CCCC-DDDD');
    expect(mint).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30, label: 'for Sam', maxRedemptions: 2, createdBy: 'admin1', expiresAt: null })
    );
  });

  it('turns a bad number into a 400', async () => {
    mint.mockRejectedValue(new RangeError('days must be a whole number from 1 to 3660'));
    expect((await POST(req('POST', { days: -1 }))).status).toBe(400);
  });
});
