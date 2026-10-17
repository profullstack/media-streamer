import { describe, expect, it } from 'vitest';

import { generateViewerKey, hashViewerKey, isFreeLibrary, vodViewerCookieName } from './pass';

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

describe('isFreeLibrary', () => {
  it('is free only when neither a pass nor a per-title price is offered', () => {
    expect(isFreeLibrary({ weeklyPriceUsd: null, perTitlePriceUsd: null })).toBe(true);
    expect(isFreeLibrary({ weeklyPriceUsd: 1, perTitlePriceUsd: null })).toBe(false);
    expect(isFreeLibrary({ weeklyPriceUsd: null, perTitlePriceUsd: 1 })).toBe(false);
  });
});
