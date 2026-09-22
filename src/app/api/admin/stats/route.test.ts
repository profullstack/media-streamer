import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({
  requireAdminUser: vi.fn(),
}));

vi.mock('@/lib/admin-stats', () => ({
  getAdminPlatformStats: vi.fn(),
}));

import { getAuthenticatedUser } from '@/lib/auth';
import { requireAdminUser } from '@/lib/admin';
import { getAdminPlatformStats } from '@/lib/admin-stats';
import { GET } from './route';

const request = () => new NextRequest('http://localhost/api/admin/stats');

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(getAdminPlatformStats).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(getAdminPlatformStats).not.toHaveBeenCalled();
  });

  it('returns the stats, uncached, for an admin', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(true);
    vi.mocked(getAdminPlatformStats).mockResolvedValue({ users: { total: 1986 } } as any);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ users: { total: 1986 } });
  });

  it('returns 500 when the database call fails', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(true);
    vi.mocked(getAdminPlatformStats).mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(request());

    expect(response.status).toBe(500);
  });
});
