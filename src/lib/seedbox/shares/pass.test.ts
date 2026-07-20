import { describe, expect, it } from 'vitest';

import {
  buildPassCookieValue,
  generateGrantToken,
  hashGrantToken,
  parsePassCookieValue,
  passCookieName,
  verifyGrantToken,
} from './pass';

describe('grant tokens', () => {
  it('hashes and verifies a token in constant time', () => {
    const token = generateGrantToken();
    const hash = hashGrantToken(token);
    expect(hash).toHaveLength(64); // sha256 hex
    expect(verifyGrantToken(token, hash)).toBe(true);
  });

  it('rejects a wrong token', () => {
    const hash = hashGrantToken(generateGrantToken());
    expect(verifyGrantToken(generateGrantToken(), hash)).toBe(false);
  });

  it('rejects empty/garbage input safely', () => {
    expect(verifyGrantToken('', 'abc')).toBe(false);
    expect(verifyGrantToken('x', '')).toBe(false);
    expect(verifyGrantToken('x', 'not-hex-zz')).toBe(false);
  });

  it('generates distinct tokens', () => {
    expect(generateGrantToken()).not.toBe(generateGrantToken());
  });
});

describe('pass cookie', () => {
  it('round-trips grantId + token', () => {
    const value = buildPassCookieValue('grant-123', 'tok.en-with.dots');
    const parsed = parsePassCookieValue(value);
    expect(parsed).toEqual({ grantId: 'grant-123', token: 'tok.en-with.dots' });
  });

  it('returns null for malformed cookie values', () => {
    expect(parsePassCookieValue(undefined)).toBeNull();
    expect(parsePassCookieValue('')).toBeNull();
    expect(parsePassCookieValue('nodot')).toBeNull();
    expect(parsePassCookieValue('.leading')).toBeNull();
    expect(parsePassCookieValue('trailing.')).toBeNull();
  });

  it('names cookies per slug', () => {
    expect(passCookieName('abc123')).toBe('share_pass_abc123');
  });
});
