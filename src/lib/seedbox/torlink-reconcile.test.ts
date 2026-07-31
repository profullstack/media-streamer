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

  it('keeps seeding/paused only when their files still exist', () => {
    expect(isLiveTorrent('seeding', 'Kept.Seed', disk)).toBe(true);
    expect(isLiveTorrent('seeding', 'Deleted.Seed', disk)).toBe(false);
    expect(isLiveTorrent('paused', 'Deleted.Seed', disk)).toBe(false);
  });

  it('fails open (keeps items) when the disk listing is unavailable', () => {
    expect(isLiveTorrent('seeding', 'Deleted.Seed', null)).toBe(true);
    expect(isLiveTorrent('paused', 'Whatever', null)).toBe(true);
  });
});

describe('isLiveTorrent — a torrent must never silently vanish', () => {
  const disk = ['Kept.Seed'];

  it('always shows a failed torrent, even with nothing on disk', () => {
    // A torrent that errored has no files by definition, so disk-reconciling it
    // hid every failure: adds that succeeded but could not start just
    // disappeared from the page, with no way to tell they had ever arrived.
    expect(isLiveTorrent('failed', 'Just.Added.No.Files', disk)).toBe(true);
    expect(isLiveTorrent('failed', 'Just.Added.No.Files', [])).toBe(true);
  });

  it('shows in-flight states that have no files yet', () => {
    for (const status of ['downloading', 'queued', 'connecting', 'metadata', 'checking']) {
      expect(isLiveTorrent(status, 'Not.On.Disk.Yet', disk)).toBe(true);
    }
  });

  it('shows a status it has never heard of rather than hiding it', () => {
    // Allow-listing visible states would make any future torlink status vanish.
    expect(isLiveTorrent('some-new-torlink-state', 'Not.On.Disk.Yet', disk)).toBe(true);
    expect(isLiveTorrent('', 'Not.On.Disk.Yet', disk)).toBe(true);
  });

  it('still drops missing, and still reconciles stored torrents', () => {
    expect(isLiveTorrent('missing', 'Kept.Seed', disk)).toBe(false);
    expect(isLiveTorrent('seeding', 'Deleted.Seed', disk)).toBe(false);
    expect(isLiveTorrent('paused', 'Deleted.Seed', disk)).toBe(false);
    expect(isLiveTorrent('seeding', 'Kept.Seed', disk)).toBe(true);
  });
});
