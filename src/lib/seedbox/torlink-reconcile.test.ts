import { describe, expect, it } from 'vitest';

import { isLiveTorrent, isOnDisk } from './torlink-reconcile';

describe('isOnDisk', () => {
  const disk = ['Big Buck Bunny.mp4', 'Some.Show.S01', 'ubuntu-24.04.iso'];

  it('matches exact and case-insensitively', () => {
    expect(isOnDisk('Some.Show.S01', disk)).toBe(true);
    expect(isOnDisk('some.show.s01', disk)).toBe(true);
  });

  it('matches when one side carries a file extension (prefix either way)', () => {
    expect(isOnDisk('Big Buck Bunny', disk)).toBe(true); // folder name vs on-disk file w/ ext
    expect(isOnDisk('ubuntu-24.04.iso', disk)).toBe(true);
  });

  it('returns false for a torrent whose data is gone', () => {
    expect(isOnDisk('Deleted Movie 2021', disk)).toBe(false);
    expect(isOnDisk('', disk)).toBe(false);
  });
});

describe('isLiveTorrent', () => {
  const disk = ['Kept.Seed'];

  it('always drops torlink "missing" records', () => {
    expect(isLiveTorrent('missing', 'Kept.Seed', disk)).toBe(false);
    expect(isLiveTorrent('missing', 'Kept.Seed', null)).toBe(false);
  });

  it('always keeps active transfers regardless of disk', () => {
    expect(isLiveTorrent('downloading', 'Not.On.Disk.Yet', disk)).toBe(true);
    expect(isLiveTorrent('queued', 'Not.On.Disk.Yet', disk)).toBe(true);
  });

  it('keeps seeding/paused/failed only when their files still exist', () => {
    expect(isLiveTorrent('seeding', 'Kept.Seed', disk)).toBe(true);
    expect(isLiveTorrent('seeding', 'Deleted.Seed', disk)).toBe(false);
    expect(isLiveTorrent('paused', 'Deleted.Seed', disk)).toBe(false);
    expect(isLiveTorrent('failed', 'Deleted.Seed', disk)).toBe(false);
  });

  it('fails open (keeps items) when the disk listing is unavailable', () => {
    expect(isLiveTorrent('seeding', 'Deleted.Seed', null)).toBe(true);
    expect(isLiveTorrent('paused', 'Whatever', null)).toBe(true);
  });
});
