import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONNECT_CODE_PREFIX, baseUrl, buildLocalInstallScript, isPublicHost, parseConnectCode } from './local-install';

const encode = (o: unknown) => CONNECT_CODE_PREFIX + Buffer.from(JSON.stringify(o)).toString('base64url');
const GOOD = { v: 1, h: '203.0.113.10', sp: 9161, fp: 9160, t: 'aB3_dE5-fG7hJ9kL1mN3pQ5r', n: 'node-1' };

describe('the torlink installer people run on their own machine', () => {
  const script = buildLocalInstallScript();

  it('is valid bash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bt-install-'));
    const file = join(dir, 'install.sh');
    writeFileSync(file, script);
    expect(() => execFileSync('bash', ['-n', file])).not.toThrow();
  });

  it('holds no token: the box makes its own', () => {
    expect(script).toContain('TOK="$BT_TORLINK_TOKEN"');
    expect(script).toContain('head -c 24 /dev/urandom');
    expect(script).not.toContain('__BT_LOCAL_TOKEN__');
    expect(script).not.toMatch(/TOK='[A-Za-z0-9_-]{20,}'/);
  });

  it('prints a code in the format the connect route reads', () => {
    expect(script).toContain(`CODE="${CONNECT_CODE_PREFIX}`);
    expect(script).toContain('"v\\":1');
    expect(script).toContain('nixamp daemon start ~/Downloads/done');
  });
});

describe('connect codes', () => {
  it('reads a good one', () => {
    expect(parseConnectCode(encode(GOOD))).toEqual({
      ok: true,
      code: { host: '203.0.113.10', servePort: 9161, filesPort: 9160, token: GOOD.t, name: 'node-1' },
    });
    // A code wrapped across lines by a terminal still reads.
    const wrapped = encode(GOOD).replace(/(.{20})/g, '$1\n');
    expect(parseConnectCode(wrapped).ok).toBe(true);
  });

  it('refuses anything else, and says why', () => {
    const bad: [string, unknown][] = [
      ['not a code', 'hello'],
      ['cut short', `${CONNECT_CODE_PREFIX}eyJ2Ijox`],
      ['wrong version', encode({ ...GOOD, v: 2 })],
      ['bad port', encode({ ...GOOD, sp: 70000 })],
      ['no token', encode({ ...GOOD, t: '' })],
      ['token with shell in it', encode({ ...GOOD, t: "abc'; rm -rf / #aaaaaaaaaaaa" })],
      ['loopback', encode({ ...GOOD, h: '127.0.0.1' })],
      ['private', encode({ ...GOOD, h: '10.0.0.5' })],
      ['docker bridge', encode({ ...GOOD, h: '172.17.0.1' })],
      ['localhost', encode({ ...GOOD, h: 'localhost' })],
      ['metadata service', encode({ ...GOOD, h: '169.254.169.254' })],
      ['ipv6 loopback', encode({ ...GOOD, h: '::1' })],
    ];
    for (const [why, value] of bad) {
      const r = parseConnectCode(value);
      expect(r.ok, why).toBe(false);
      if (!r.ok) expect(r.error.length, why).toBeGreaterThan(10);
    }
  });

  it('knows a public host', () => {
    expect(isPublicHost('203.0.113.10')).toBe(true);
    expect(isPublicHost('box.example.com')).toBe(true);
    expect(isPublicHost('2001:db8::1')).toBe(true);
    expect(isPublicHost('192.168.1.2')).toBe(false);
    expect(isPublicHost('100.64.0.1')).toBe(false);
    expect(isPublicHost('fd00::1')).toBe(false);
    expect(isPublicHost('nas.local')).toBe(false);
    expect(isPublicHost('256.1.1.1')).toBe(false);
  });

  it('brackets IPv6 in a URL', () => {
    expect(baseUrl('203.0.113.10', 9161)).toBe('http://203.0.113.10:9161');
    expect(baseUrl('2001:db8::1', 9160)).toBe('http://[2001:db8::1]:9160');
  });
});
