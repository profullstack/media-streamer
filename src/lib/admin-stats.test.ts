import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getServerClient: vi.fn(),
}));

import {
  clampLimit,
  clampOffset,
  getAdminPlatformStats,
  listAdminUsers,
  parseSortDirection,
  parseUserSortKey,
} from './admin-stats';

function clientWith(result: { data?: unknown; error?: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }) } as any;
}

describe('admin-stats parsing', () => {
  it('falls back to created_at for unknown sort keys', () => {
    expect(parseUserSortKey('email')).toBe('email');
    expect(parseUserSortKey('paid_usd')).toBe('paid_usd');
    expect(parseUserSortKey('password')).toBe('created_at');
    expect(parseUserSortKey(null)).toBe('created_at');
  });

  it('only accepts asc as the ascending direction', () => {
    expect(parseSortDirection('asc')).toBe('asc');
    expect(parseSortDirection('ASC')).toBe('asc');
    expect(parseSortDirection('up')).toBe('desc');
    expect(parseSortDirection(undefined)).toBe('desc');
  });

  it('clamps page size to 1..500 and offset to >= 0, defaulting on garbage', () => {
    expect(clampLimit(null)).toBe(50);
    expect(clampLimit(NaN)).toBe(50);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(9999)).toBe(500);
    expect(clampLimit(25.7)).toBe(25);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset(120)).toBe(120);
  });
});

describe('getAdminPlatformStats', () => {
  it('calls the stats function and normalises money fields that arrive as strings', async () => {
    const client = clientWith({
      data: {
        generated_at: '2026-09-22T00:00:00Z',
        users: { total: 10 },
        signups_daily: [],
        subscriptions: {},
        revenue: {
          subscriptions: { paid_count: '6', paid_usd: '39.94', paid_usd_30d: '0', paid_count_30d: 0, pending_count: '37' },
          iptv: { paid_count: 0, paid_usd: '0' },
        },
        content: {},
      },
    });

    const stats = await getAdminPlatformStats(client);

    expect(client.rpc).toHaveBeenCalledWith('admin_platform_stats');
    expect(stats.revenue.subscriptions).toEqual({
      paid_count: 6,
      paid_usd: 39.94,
      paid_usd_30d: 0,
      paid_count_30d: 0,
      pending_count: 37,
    });
    expect(stats.revenue.iptv.paid_usd).toBe(0);
  });

  it('throws the database error message', async () => {
    const client = clientWith({ error: { message: 'permission denied for function admin_platform_stats' } });
    await expect(getAdminPlatformStats(client)).rejects.toThrow('permission denied');
  });
});

describe('listAdminUsers', () => {
  it('passes sanitised arguments to the SQL function', async () => {
    const client = clientWith({ data: { total: 0, limit: 25, offset: 50, sort: 'email', dir: 'asc', rows: [] } });

    await listAdminUsers({ search: '  chovy ', sort: 'email', dir: 'asc', limit: 25, offset: 50 }, client);

    expect(client.rpc).toHaveBeenCalledWith('admin_list_users', {
      p_search: 'chovy',
      p_sort: 'email',
      p_dir: 'asc',
      p_limit: 25,
      p_offset: 50,
    });
  });

  it('sends null for a blank search and defaults the rest', async () => {
    const client = clientWith({ data: { total: 0, limit: 50, offset: 0, sort: 'created_at', dir: 'desc', rows: [] } });

    await listAdminUsers({ search: '   ', sort: 'nope', dir: 'sideways' }, client);

    expect(client.rpc).toHaveBeenCalledWith('admin_list_users', {
      p_search: null,
      p_sort: 'created_at',
      p_dir: 'desc',
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('coerces paid totals on each row to numbers', async () => {
    const client = clientWith({
      data: {
        total: 1,
        limit: 50,
        offset: 0,
        sort: 'created_at',
        dir: 'desc',
        rows: [{ id: 'u1', email: 'a@b.c', paid_usd: '9.99', paid_count: '1', is_admin: true, tier: 'family' }],
      },
    });

    const page = await listAdminUsers({}, client);

    expect(page.rows[0].paid_usd).toBe(9.99);
    expect(page.rows[0].paid_count).toBe(1);
    expect(page.rows[0].is_admin).toBe(true);
  });
});
