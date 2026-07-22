import { describe, expect, it } from 'vitest';

import { extOf, stableId } from './shared';

describe('stableId', () => {
  it('is deterministic and 24 hex chars', () => {
    const a = stableId('http://example.com/a.mp4');
    const b = stableId('http://example.com/a.mp4');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
  });
  it('differs for different inputs', () => {
    expect(stableId('a')).not.toBe(stableId('b'));
  });
});

describe('extOf', () => {
  it('extracts a lowercase extension', () => {
    expect(extOf('Movie.MKV')).toBe('mkv');
    expect(extOf('http://x/y/z.mp4?token=abc')).toBe('mp4');
  });
  it('returns null for no/oversized/invalid extension', () => {
    expect(extOf('noext')).toBeNull();
    expect(extOf(null)).toBeNull();
    expect(extOf('file.superlongext')).toBeNull();
    expect(extOf('a.b#c')).toBe('b');
  });
});
