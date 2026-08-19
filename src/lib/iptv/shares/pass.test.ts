import { describe, expect, it } from 'vitest';

import { passCookieName } from '@/lib/seedbox/shares/pass';
import {
  generateGrantToken,
  generateIptvShareSlug,
  hashGrantToken,
  iptvPassCookieName,
  verifyGrantToken,
} from './pass';

describe('iptv pass tokens', () => {
  it('reuses the shared token primitives rather than a second copy', () => {
    const token = generateGrantToken();
    const hash = hashGrantToken(token);
    expect(hash).toHaveLength(64);
    expect(verifyGrantToken(token, hash)).toBe(true);
    expect(verifyGrantToken(generateGrantToken(), hash)).toBe(false);
  });

  it('namespaces its cookie away from the seedbox rental cookie', () => {
    // A browser holding both passes for the same slug would otherwise have one
    // silently overwrite the other.
    expect(iptvPassCookieName('abc')).not.toBe(passCookieName('abc'));
    expect(iptvPassCookieName('abc')).toBe('iptv_pass_abc');
  });

  it('generates distinct, URL-safe slugs', () => {
    const a = generateIptvShareSlug();
    expect(a).not.toBe(generateIptvShareSlug());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
