import { describe, expect, it, vi } from 'vitest';

import type { SeedboxHttpConfig } from './config';
import { verifyTorrentRegistered } from './add-verify';

const HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';

const http = {
  baseUrl: 'http://box.example.com:9161',
  addPath: '/add',
  magnetField: 'magnet',
  token: 'tok',
  auth: { kind: 'bearer' },
} as unknown as SeedboxHttpConfig;

/** A fetch stub answering /status with the given torlink payload. */
function statusFetch(payload: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

const noSleep = async (): Promise<void> => {};

describe('verifyTorrentRegistered', () => {
  it('confirms a torrent torlink is actually tracking', async () => {
    const fetchImpl = statusFetch({ downloads: [{ id: HASH, name: 'Big Buck Bunny' }], seeds: [] });
    const outcome = await verifyTorrentRegistered(http, HASH, 'Big Buck Bunny', {
      fetchImpl,
      sleep: noSleep,
    });
    expect(outcome).toBe('registered');
  });

  it('matches a torrent that finished and moved to seeds', async () => {
    const fetchImpl = statusFetch({ downloads: [], seeds: [{ id: HASH.toUpperCase(), name: 'X' }] });
    expect(await verifyTorrentRegistered(http, HASH, 'X', { fetchImpl, sleep: noSleep })).toBe(
      'registered'
    );
  });

  it('reports missing when torlink claimed success but has nothing', async () => {
    // The production bug: /add answered {"ok":true,"outcome":"added"} and the
    // torrent never existed. Verification is the only thing that catches it.
    const fetchImpl = statusFetch({ downloads: [], seeds: [{ id: 'beef', name: 'Unrelated' }] });
    const outcome = await verifyTorrentRegistered(http, HASH, 'Big Buck Bunny', {
      fetchImpl,
      sleep: noSleep,
      attempts: 3,
    });
    expect(outcome).toBe('missing');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries and succeeds when the torrent shows up late', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => (call < 3 ? { downloads: [], seeds: [] } : { downloads: [{ id: HASH }] }),
      };
    }) as unknown as typeof fetch;

    expect(
      await verifyTorrentRegistered(http, HASH, 'Late', { fetchImpl, sleep: noSleep, attempts: 4 })
    ).toBe('registered');
  });

  it('falls back to a name match before metadata resolves the hash', async () => {
    const fetchImpl = statusFetch({ downloads: [{ id: '', name: 'Big Buck Bunny' }], seeds: [] });
    expect(
      await verifyTorrentRegistered(http, HASH, 'Big Buck Bunny', { fetchImpl, sleep: noSleep })
    ).toBe('registered');
  });
});

describe('verifyTorrentRegistered — never cry wolf', () => {
  it('is unknown, not missing, when /status cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await verifyTorrentRegistered(http, HASH, 'X', { fetchImpl, sleep: noSleep })).toBe(
      'unknown'
    );
  });

  it('is unknown when /status returns an error code', async () => {
    const fetchImpl = statusFetch({}, false);
    expect(await verifyTorrentRegistered(http, HASH, 'X', { fetchImpl, sleep: noSleep })).toBe(
      'unknown'
    );
  });

  it('is unknown when the magnet carries no infohash to match', async () => {
    const fetchImpl = statusFetch({ downloads: [], seeds: [] });
    expect(await verifyTorrentRegistered(http, null, 'X', { fetchImpl, sleep: noSleep })).toBe(
      'unknown'
    );
    // No point calling /status when there is nothing to look for.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not burn retries on an unreachable daemon', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    await verifyTorrentRegistered(http, HASH, 'X', { fetchImpl, sleep: noSleep, attempts: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
