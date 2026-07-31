import { describe, expect, it, vi } from 'vitest';

import type { SeedboxConfig } from './config';
import { cleanupStaleTorrents } from './cleanup';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);

const config = {
  http: {
    baseUrl: 'http://box.example.com:9161',
    addPath: '/add',
    magnetField: 'magnet',
    token: 'tok',
    auth: { kind: 'bearer' },
  },
  files: { baseUrl: 'http://box.example.com:9160', token: 'tok', auth: { kind: 'bearer' } },
  ssh: null,
} as unknown as SeedboxConfig;

interface Routes {
  entries?: { name: string }[] | null;
  status?: unknown;
  controlStatus?: number;
}

/** Stub the three endpoints cleanup touches, recording control calls. */
function makeFetch(routes: Routes): { fetchImpl: typeof fetch; controlCalls: unknown[] } {
  const controlCalls: unknown[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.includes(':9160')) {
      if (routes.entries === null) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ entries: routes.entries ?? [] }) };
    }
    if (href.endsWith('/status')) {
      if (routes.status === null) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => routes.status };
    }
    if (href.endsWith('/control')) {
      controlCalls.push(JSON.parse(String(init?.body ?? '{}')));
      const status = routes.controlStatus ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true }) };
    }
    throw new Error(`unexpected fetch: ${href}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, controlCalls };
}

describe('cleanupStaleTorrents', () => {
  it('removes records whose files are gone, and leaves the rest alone', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [{ name: 'Kept.Movie' }],
      status: {
        downloads: [],
        seeds: [
          { id: HASH_A, name: 'Kept.Movie', status: 'paused' },
          { id: HASH_B, name: 'Deleted.Movie', status: 'paused' },
        ],
      },
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.skipped).toBeNull();
    expect(result.removed.map((t) => t.name)).toEqual(['Deleted.Movie']);
    expect(controlCalls).toEqual([{ id: HASH_B, action: 'remove' }]);
  });

  it('uses "remove", never "delete", so files are never touched', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [{ name: 'Something' }],
      status: { downloads: [], seeds: [{ id: HASH_A, name: 'Ghost', status: 'paused' }] },
    });

    await cleanupStaleTorrents(config, fetchImpl);

    expect(controlCalls).toHaveLength(1);
    expect((controlCalls[0] as { action: string }).action).toBe('remove');
    expect(controlCalls[0]).not.toHaveProperty('deleteFiles', true);
  });

  it('drops torlink’s own "missing" records', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [{ name: 'Kept' }],
      status: { downloads: [{ id: HASH_B, name: 'Whatever', status: 'missing' }], seeds: [] },
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(1);
    expect(controlCalls).toHaveLength(1);
  });

  it('treats a 404 from torlink as already-gone, not a failure', async () => {
    const { fetchImpl } = makeFetch({
      entries: [{ name: 'Kept' }],
      status: { downloads: [], seeds: [{ id: HASH_A, name: 'Ghost', status: 'paused' }] },
      controlStatus: 404,
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it('reports records torlink refused to drop', async () => {
    const { fetchImpl } = makeFetch({
      entries: [{ name: 'Kept' }],
      status: { downloads: [], seeds: [{ id: HASH_A, name: 'Ghost', status: 'paused' }] },
      controlStatus: 500,
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(0);
    expect(result.failed).toEqual([{ name: 'Ghost', reason: 'torlink returned 500' }]);
  });
});

describe('cleanupStaleTorrents — refuses to prune without trustworthy ground truth', () => {
  it('does nothing when the file listing cannot be read', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: null,
      status: { downloads: [], seeds: [{ id: HASH_A, name: 'Ghost', status: 'paused' }] },
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toMatch(/could not list/i);
    expect(controlCalls).toHaveLength(0);
  });

  it('does nothing when the file listing is empty', async () => {
    // An empty listing is indistinguishable from a file server pointed at the
    // wrong directory — pruning against it would erase every record on the box.
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [],
      status: {
        downloads: [],
        seeds: [
          { id: HASH_A, name: 'Real.One', status: 'paused' },
          { id: HASH_B, name: 'Real.Two', status: 'seeding' },
        ],
      },
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toMatch(/empty/i);
    expect(controlCalls).toHaveLength(0);
  });

  it('never prunes in-flight or failed torrents, which have no files yet', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [{ name: 'Unrelated' }],
      status: {
        downloads: [
          { id: HASH_A, name: 'Downloading.Now', status: 'downloading' },
          { id: HASH_B, name: 'Errored', status: 'failed' },
          { id: 'c'.repeat(40), name: 'Queued.Up', status: 'queued' },
          { id: 'd'.repeat(40), name: 'Brand.New.State', status: 'some-future-state' },
        ],
        seeds: [],
      },
    });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.removed).toHaveLength(0);
    expect(controlCalls).toHaveLength(0);
  });

  it('does nothing when torlink status cannot be read', async () => {
    const { fetchImpl, controlCalls } = makeFetch({ entries: [{ name: 'Kept' }], status: null });

    const result = await cleanupStaleTorrents(config, fetchImpl);

    expect(result.skipped).toMatch(/status/i);
    expect(controlCalls).toHaveLength(0);
  });

  it('skips entries with no infohash to address', async () => {
    const { fetchImpl, controlCalls } = makeFetch({
      entries: [{ name: 'Kept' }],
      status: { downloads: [], seeds: [{ id: '', name: 'No.Id', status: 'paused' }] },
    });

    await cleanupStaleTorrents(config, fetchImpl);

    expect(controlCalls).toHaveLength(0);
  });
});
