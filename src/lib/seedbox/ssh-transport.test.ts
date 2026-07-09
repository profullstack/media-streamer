import { describe, it, expect } from 'vitest';

import {
  buildMagnetFilename,
  buildWatchDirCommand,
  renderAddCommand,
  shellQuote,
} from './ssh-transport';

const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Ex';

describe('shellQuote', () => {
  it('wraps values in single quotes', () => {
    expect(shellQuote('hello world')).toBe(`'hello world'`);
  });
  it('escapes embedded single quotes', () => {
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
  });
  it('neutralizes shell metacharacters', () => {
    expect(shellQuote('a; rm -rf /')).toBe(`'a; rm -rf /'`);
  });
});

describe('buildMagnetFilename', () => {
  it('sanitizes to a safe .magnet basename', () => {
    expect(buildMagnetFilename('The Matrix (1999) [1080p]')).toBe('The Matrix 1999 1080p.magnet');
  });
  it('strips path separators', () => {
    expect(buildMagnetFilename('../../etc/passwd')).toBe('.. .. etc passwd.magnet');
  });
  it('falls back when the name is empty after cleaning', () => {
    expect(buildMagnetFilename('///')).toBe('torrent.magnet');
    expect(buildMagnetFilename('')).toBe('torrent.magnet');
  });
});

describe('renderAddCommand', () => {
  it('substitutes shell-quoted magnet and name', () => {
    const cmd = renderAddCommand('torlink add {magnet} --label {name}', MAGNET, 'My Movie');
    expect(cmd).toBe(`torlink add '${MAGNET}' --label 'My Movie'`);
  });
  it('quotes malicious substitutions safely', () => {
    const cmd = renderAddCommand('torlink add {magnet}', `x'; rm -rf /`, '');
    expect(cmd).toBe(`torlink add 'x'\\''; rm -rf /'`);
  });
});

describe('buildWatchDirCommand', () => {
  it('writes to a temp file then moves it into place', () => {
    const cmd = buildWatchDirCommand('/home/user/watch', 'Movie.magnet');
    expect(cmd).toContain('mktemp');
    expect(cmd).toContain('cat >');
    expect(cmd).toContain(`mv "$tmp" '/home/user/watch/Movie.magnet'`);
  });
  it('normalizes trailing slashes on the dir', () => {
    const cmd = buildWatchDirCommand('/home/user/watch/', 'a.magnet');
    expect(cmd).toContain(`'/home/user/watch/a.magnet'`);
  });
});
