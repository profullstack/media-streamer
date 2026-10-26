import { describe, expect, it } from 'vitest';
import { sameOriginPath } from './safe-redirect';

describe('sameOriginPath', () => {
  it('keeps same-site paths', () => {
    expect(sameOriginPath('/account?tab=subscription')).toBe('/account?tab=subscription');
    expect(sameOriginPath('/connect?redirect=%2Fx')).toBe('/connect?redirect=%2Fx');
  });

  it('falls back for anything that can leave the site or run script', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'javascript:alert(1)',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
    ]) {
      expect(sameOriginPath(bad)).toBe('/');
    }
    expect(sameOriginPath('https://evil.example', '/home')).toBe('/home');
  });
});
