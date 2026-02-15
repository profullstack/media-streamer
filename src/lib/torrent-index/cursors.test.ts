import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

import { fetchTorrentsPage, fetchTorrentsMonthPage, normalizeInfoHash } from './cursors';

describe('normalizeInfoHash', () => {
  it('strips \\x prefix', () => {
    expect(normalizeInfoHash('\\xaabbccdd')).toBe('aabbccdd');
  });

  it('lowercases 40-char hex', () => {
    const hex = 'AABBCCDDEE' + 'AABBCCDDEE' + 'AABBCCDDEE' + 'AABBCCDDEE';
    expect(normalizeInfoHash(hex)).toBe(hex.toLowerCase());
  });

  it('handles Buffer input', () => {
    const buf = Buffer.from('ab', 'hex');
    expect(normalizeInfoHash(buf)).toBe('ab');
  });

  it('handles Uint8Array input', () => {
    const arr = new Uint8Array([0xab, 0xcd]);
    expect(normalizeInfoHash(arr)).toBe('abcd');
  });

  it('decodes base64 fallback', () => {
    const hex = 'deadbeef';
    const b64 = Buffer.from(hex, 'hex').toString('base64');
    expect(normalizeInfoHash(b64)).toBe(hex);
  });
});

describe('fetchTorrentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeRow = (i: number) => ({
    info_hash: `\\x${'a'.repeat(40)}`,
    name: `torrent-${i}`,
    size: 1000 * i,
    created_at: '2025-01-15T12:00:00Z',
    files_count: 1,
    files_status: 'ready',
    extension: 'mp4',
    private: false,
    updated_at: '2025-01-15T12:00:00Z',
  });

  it('calls rpc with correct params (no cursor)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchTorrentsPage(10);
    expect(mockRpc).toHaveBeenCalledWith('list_torrents_page', { page_size: 10 });
  });

  it('calls rpc with cursor params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchTorrentsPage(10, 1705312800, 'abc123');
    expect(mockRpc).toHaveBeenCalledWith('list_torrents_page', {
      page_size: 10,
      before_ts: new Date(1705312800 * 1000).toISOString(),
      before_id: 'abc123',
    });
  });

  it('returns nextCursor null when fewer results than pageSize', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow(1)], error: null });
    const result = await fetchTorrentsPage(10);
    expect(result.torrents).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when results === pageSize', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => makeRow(i));
    mockRpc.mockResolvedValue({ data: rows, error: null });
    const result = await fetchTorrentsPage(3);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor!.before_ts).toBe(Math.floor(new Date('2025-01-15T12:00:00Z').getTime() / 1000));
    expect(result.nextCursor!.before_id).toBe('a'.repeat(40));
  });

  it('normalizes info_hash in results', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow(1)], error: null });
    const result = await fetchTorrentsPage(10);
    expect(result.torrents[0].info_hash).toBe('a'.repeat(40));
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } });
    await expect(fetchTorrentsPage(10)).rejects.toThrow('list_torrents_page: db down');
  });
});

describe('fetchTorrentsMonthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls rpc with month range params', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchTorrentsMonthPage(10, 2025, 3);
    expect(mockRpc).toHaveBeenCalledWith('list_torrents_month_page', {
      page_size: 10,
      start_ts: new Date(Date.UTC(2025, 2, 1)).toISOString(),
      end_ts: new Date(Date.UTC(2025, 3, 1)).toISOString(),
    });
  });

  it('includes cursor params when provided', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchTorrentsMonthPage(10, 2025, 3, 1705312800, 'abc');
    const call = mockRpc.mock.calls[0][1];
    expect(call.before_ts).toBe(new Date(1705312800 * 1000).toISOString());
    expect(call.before_id).toBe('abc');
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await expect(fetchTorrentsMonthPage(10, 2025, 1)).rejects.toThrow('list_torrents_month_page: timeout');
  });

  it('returns nextCursor null when fewer results than pageSize', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await fetchTorrentsMonthPage(10, 2025, 1);
    expect(result.nextCursor).toBeNull();
  });
});
