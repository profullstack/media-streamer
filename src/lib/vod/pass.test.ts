import { describe, expect, it } from 'vitest';

import { generateViewerKey, hashViewerKey, vodViewerCookieName } from './pass';

describe('vod viewer identity', () => {
  it('hashes a key deterministically to sha256 hex', () => {
    const key = generateViewerKey();
    expect(hashViewerKey(key)).toBe(hashViewerKey(key));
    expect(hashViewerKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('generates distinct keys', () => {
    expect(generateViewerKey()).not.toBe(generateViewerKey());
  });
  it('namespaces the cookie per slug', () => {
    expect(vodViewerCookieName('abc')).toBe('vod_viewer_abc');
  });
});
