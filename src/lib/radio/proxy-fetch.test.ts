import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A dispatcher only works with the fetch from the same undici instance.
 *
 * Node backs global fetch with its own bundled undici, so passing a ProxyAgent
 * built from the `undici` package fails at runtime with
 * "UND_ERR_INVALID_ARG: invalid onRequestStart method". It worked while the package
 * tracked undici 7 and broke on the bump to 8 -- which took SiriusXM login down
 * with an error that named neither undici nor the version.
 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith('.ts') && !p.includes('.test.') ? [p] : [];
  });
}

describe('undici dispatcher usage', () => {
  it('no file hands a dispatcher to the global fetch', () => {
    const offenders: string[] = [];

    for (const file of walk('src')) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('dispatcher:')) continue;

      // The file must obtain fetch from undici, one way or another.
      const usesUndiciFetch =
        /from 'undici'/.test(src) && /undiciFetch|fetch as undiciFetch/.test(src);
      const usesHelper = /proxyFetch/.test(src);
      if (!usesUndiciFetch && !usesHelper) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('the radio path routes every proxied call through the shared helper', () => {
    for (const file of [
      'src/lib/radio/siriusxm.ts',
      'src/lib/radio/siriusxm-auth.ts',
      'src/app/api/radio/proxy/route.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('proxyFetch');
      // A bare `await fetch(` alongside a dispatcher is the exact regression.
      const bareWithDispatcher = /await fetch\([^)]*\{[^}]*dispatcher/s.test(src);
      expect(bareWithDispatcher).toBe(false);
    }
  });
});
