import { describe, expect, it } from 'vitest';

import { actionsFor, fmtBytes, fmtSpeed, mergeTorrents, type Torrent } from './torlink-status';

describe('fmtBytes', () => {
  it('formats byte magnitudes 1024-based', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1024)).toBe('1.0 KB');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fmtBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('guards against non-finite / negative input', () => {
    expect(fmtBytes(-1)).toBe('0 B');
    expect(fmtBytes(NaN)).toBe('0 B');
  });

  it('fmtSpeed appends /s', () => {
    expect(fmtSpeed(1024)).toBe('1.0 KB/s');
  });
});

describe('mergeTorrents', () => {
  interface Dl {
    id: string;
    name: string;
    status: string;
    progress: number;
    peers: number;
    speed: number;
  }
  const dl = (over: Partial<Dl> = {}): Dl => ({
    id: 'a', name: 'A', status: 'downloading', progress: 40, peers: 3, speed: 1000, ...over,
  });

  it('merges a seed onto its matching download by infohash (no duplicates)', () => {
    const merged = mergeTorrents(
      [dl({ id: 'x', status: 'seeding', progress: 100, peers: 1 })],
      [{ id: 'x', name: 'A', status: 'seeding', peers: 4, uploaded: 2048 }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'x', status: 'seeding', progress: 100, uploaded: 2048, peers: 4 });
  });

  it('includes seed-only torrents (finished + moved out of downloads)', () => {
    const merged = mergeTorrents([], [{ id: 'y', name: 'Y', status: 'seeding', peers: 0, uploaded: 500 }]);
    expect(merged).toEqual([
      { id: 'y', name: 'Y', status: 'seeding', progress: 100, peers: 0, speed: 0, uploaded: 500, kind: 'seed' },
    ]);
  });

  it('tags kind by source list so "paused" can be disambiguated', () => {
    const dl = mergeTorrents([{ id: 'a', name: 'A', status: 'paused', progress: 30, peers: 0, speed: 0 }], []);
    expect(dl[0].kind).toBe('download');
    const seed = mergeTorrents([], [{ id: 'b', name: 'B', status: 'paused', peers: 0, uploaded: 0 }]);
    expect(seed[0].kind).toBe('seed');
  });

  it('treats seeding downloads as 100% and keeps active progress otherwise', () => {
    const merged = mergeTorrents([dl({ id: 'p', status: 'downloading', progress: 25 })], []);
    expect(merged[0].progress).toBe(25);
    const seeding = mergeTorrents([dl({ id: 'q', status: 'seeding', progress: 12 })], []);
    expect(seeding[0].progress).toBe(100);
  });

  it('ranks downloading > queued > paused > seeding > failed', () => {
    const merged = mergeTorrents(
      [
        dl({ id: '1', status: 'seeding', progress: 100 }),
        dl({ id: '2', status: 'failed' }),
        dl({ id: '3', status: 'downloading' }),
        dl({ id: '4', status: 'queued' }),
        dl({ id: '5', status: 'paused' }),
      ],
      []
    );
    expect(merged.map((t) => t.status)).toEqual(['downloading', 'queued', 'paused', 'seeding', 'failed']);
  });
});

describe('actionsFor', () => {
  const t = (over: Partial<Torrent>): Torrent => ({
    id: 'i', name: 'N', status: 'downloading', progress: 0, peers: 0, speed: 0, uploaded: 0, kind: 'download', ...over,
  });
  const labels = (x: Torrent): string[] => actionsFor(x).map((a) => a.label);

  it('offers Pause while downloading/queued', () => {
    expect(labels(t({ status: 'downloading' }))).toEqual(['Pause', 'Delete']);
    expect(labels(t({ status: 'queued' }))).toEqual(['Pause', 'Delete']);
  });

  it('distinguishes a paused download (Resume) from a paused seed (Start seeding)', () => {
    expect(labels(t({ status: 'paused', kind: 'download' }))).toEqual(['Resume', 'Delete']);
    expect(labels(t({ status: 'paused', kind: 'seed' }))).toEqual(['Start seeding', 'Delete']);
  });

  it('offers Stop seeding while seeding, and always a Delete', () => {
    expect(labels(t({ status: 'seeding', kind: 'seed' }))).toEqual(['Stop seeding', 'Delete']);
    expect(actionsFor(t({ status: 'seeding' })).find((a) => a.action === 'delete')?.danger).toBe(true);
  });
});
