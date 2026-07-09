import { describe, it, expect } from 'vitest';

import type { SeedboxFilesConfig } from './config';
import { buildSeedboxFileUrl, filesAuthHeaders } from './files';

function cfg(overrides: Partial<SeedboxFilesConfig> = {}): SeedboxFilesConfig {
  return { baseUrl: 'http://box.example.com:9160', auth: { kind: 'none' }, ...overrides };
}

describe('buildSeedboxFileUrl', () => {
  it('joins and encodes torrent-relative paths', () => {
    expect(buildSeedboxFileUrl('http://box:9160', 'Movie (1999)/Movie.mkv')).toBe(
      'http://box:9160/Movie%20(1999)/Movie.mkv'
    );
  });
  it('strips trailing slashes on the base', () => {
    expect(buildSeedboxFileUrl('http://box:9160///', 'a/b.mp4')).toBe('http://box:9160/a/b.mp4');
  });
  it('rejects traversal, absolute paths, and schemes', () => {
    expect(buildSeedboxFileUrl('http://box', '../etc/passwd')).toBeNull();
    expect(buildSeedboxFileUrl('http://box', 'a/../../b')).toBeNull();
    expect(buildSeedboxFileUrl('http://box', '/etc/passwd')).toBeNull();
    expect(buildSeedboxFileUrl('http://box', 'http://evil.com/x')).toBeNull();
    expect(buildSeedboxFileUrl('http://box', 'a\\b')).toBeNull();
    expect(buildSeedboxFileUrl('http://box', '')).toBeNull();
  });
});

describe('filesAuthHeaders', () => {
  it('returns no headers for none', () => {
    expect(filesAuthHeaders(cfg())).toEqual({});
  });
  it('builds bearer / custom-header / basic', () => {
    expect(filesAuthHeaders(cfg({ auth: { kind: 'bearer', token: 't' } }))).toEqual({
      Authorization: 'Bearer t',
    });
    expect(filesAuthHeaders(cfg({ auth: { kind: 'header', header: 'X-Api-Key', token: 't' } }))).toEqual({
      'X-Api-Key': 't',
    });
    expect(filesAuthHeaders(cfg({ auth: { kind: 'basic', user: 'u', pass: 'p' } }))).toEqual({
      Authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
    });
  });
});
