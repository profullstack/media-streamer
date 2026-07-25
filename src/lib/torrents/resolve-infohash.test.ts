/**
 * Torrent identity helper tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/queries', () => ({
  getTorrentById: vi.fn(),
}));

import { resolveInfohash, isUUID, isInfohash } from './resolve-infohash';
import { getTorrentById } from '@/lib/supabase/queries';

const UUID = '12345678-1234-4123-8123-123456789abc';
const INFOHASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('isUUID / isInfohash', () => {
  it('distinguishes the two id forms', () => {
    expect(isUUID(UUID)).toBe(true);
    expect(isUUID(INFOHASH)).toBe(false);
    expect(isInfohash(INFOHASH)).toBe(true);
    expect(isInfohash(UUID)).toBe(false);
  });

  it('rejects near-misses', () => {
    expect(isInfohash(INFOHASH.slice(0, 39))).toBe(false);
    expect(isInfohash(`${INFOHASH}0`)).toBe(false);
    expect(isInfohash('g'.repeat(40))).toBe(false);
  });
});

describe('resolveInfohash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes an infohash through, lowercased', async () => {
    await expect(resolveInfohash(INFOHASH.toUpperCase())).resolves.toBe(INFOHASH);
    expect(getTorrentById).not.toHaveBeenCalled();
  });

  it('does not require a DHT torrent to exist in bt_torrents', async () => {
    (getTorrentById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(resolveInfohash(INFOHASH)).resolves.toBe(INFOHASH);
  });

  it('looks up the infohash for an indexed torrent UUID', async () => {
    (getTorrentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: UUID,
      infohash: INFOHASH.toUpperCase(),
    });

    await expect(resolveInfohash(UUID)).resolves.toBe(INFOHASH);
    expect(getTorrentById).toHaveBeenCalledWith(UUID);
  });

  it('returns null for a UUID with no matching torrent', async () => {
    (getTorrentById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(resolveInfohash(UUID)).resolves.toBeNull();
  });

  it('returns null for garbage and empty input', async () => {
    await expect(resolveInfohash('not-an-id')).resolves.toBeNull();
    await expect(resolveInfohash('')).resolves.toBeNull();
  });
});
