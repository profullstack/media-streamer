import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/admin', () => ({
  requireAdminUser: vi.fn(),
}));

vi.mock('@/lib/admin-stats', () => ({
  listAdminUsers: vi.fn(),
}));

import { getAuthenticatedUser } from '@/lib/auth';
import { requireAdminUser } from '@/lib/admin';
import { listAdminUsers } from '@/lib/admin-stats';
import { GET } from './route';

const request = (query = '') => new NextRequest(`http://localhost/api/admin/users${query}`);

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    expect((await GET(request())).status).toBe(401);
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(false);

    expect((await GET(request())).status).toBe(403);
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('forwards the query string to the lister and never caches', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(true);
    vi.mocked(listAdminUsers).mockResolvedValue({ total: 0, limit: 20, offset: 40, sort: 'email', dir: 'asc', rows: [] });

    const response = await GET(request('?search=chovy&sort=email&dir=asc&limit=20&offset=40'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(listAdminUsers).toHaveBeenCalledWith({
      search: 'chovy',
      sort: 'email',
      dir: 'asc',
      limit: 20,
      offset: 40,
    });
  });

  it('passes null for non-numeric paging so the lister applies its defaults', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'x@y.z' });
    vi.mocked(requireAdminUser).mockResolvedValue(true);
    vi.mocked(listAdminUsers).mockResolvedValue({ total: 0, limit: 50, offset: 0, sort: 'created_at', dir: 'desc', rows: [] });

    await GET(request('?limit=abc&offset='));

    expect(listAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ limit: null, offset: null }));
  });
});
