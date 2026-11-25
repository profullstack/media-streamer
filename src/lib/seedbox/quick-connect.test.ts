import { describe, expect, it } from 'vitest';
import {
  authorizeCommand,
  cleanHost,
  cleanPort,
  cleanUser,
  explainSshFailure,
  isPublicKeyLine,
  loginCommand,
} from './quick-connect';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq0h0wqmR1b1d4q0mJ6m2oQ8m3vV0m1kq2h3n4b5c6d bittorrented-seedbox';

describe('quick connect', () => {
  it('accepts an address and nothing ssh would read as an option', () => {
    expect(cleanHost(' 203.0.113.10 ')).toBe('203.0.113.10');
    expect(cleanHost('box.example.com')).toBe('box.example.com');
    expect(cleanHost('[2001:db8::1]')).toBe('2001:db8::1');
    for (const bad of ['-oProxyCommand=x', 'a b', 'host;rm -rf /', 'user@host', '', '$(id)', 'a'.repeat(300), 42]) {
      expect(cleanHost(bad), String(bad)).toBeNull();
    }
  });

  it('defaults the user to root and the port to 22', () => {
    expect(cleanUser(undefined)).toBe('root');
    expect(cleanUser('')).toBe('root');
    expect(cleanUser('seeduser')).toBe('seeduser');
    expect(cleanUser('-oX')).toBeNull();
    expect(cleanUser('a b')).toBeNull();
    expect(cleanPort(undefined)).toBe(22);
    expect(cleanPort('2222')).toBe(2222);
    expect(cleanPort('0')).toBeNull();
    expect(cleanPort('70000')).toBeNull();
    expect(cleanPort('22; id')).toBeNull();
  });

  it('writes the login line a person would type', () => {
    expect(loginCommand('203.0.113.10', 'root', 22)).toBe('ssh root@203.0.113.10');
    expect(loginCommand('box.example.com', 'seed', 2222)).toBe('ssh -p 2222 seed@box.example.com');
    expect(loginCommand('2001:db8::1', 'root', 22)).toBe('ssh root@[2001:db8::1]');
  });

  it('builds one paste-able line that adds the key once and fixes permissions', () => {
    const line = authorizeCommand(KEY);
    expect(line).toContain(`echo '${KEY}' >> ~/.ssh/authorized_keys`);
    expect(line).toContain(`grep -qxF '${KEY}'`);
    expect(line).toContain('chmod 600 ~/.ssh/authorized_keys');
    expect(line).not.toContain('\n');
  });

  it('refuses to build a line from anything but a public key', () => {
    expect(isPublicKeyLine(KEY)).toBe(true);
    for (const bad of [`${KEY}'; rm -rf ~ #`, 'ssh-ed25519 short', '-----BEGIN OPENSSH PRIVATE KEY-----', `${KEY}\nssh-rsa AAAA`]) {
      expect(isPublicKeyLine(bad), bad).toBe(false);
      expect(() => authorizeCommand(bad)).toThrow();
    }
  });

  it('says what went wrong in words', () => {
    expect(explainSshFailure('root@1.2.3.4: Permission denied (publickey,password).')).toContain('paste the line');
    expect(explainSshFailure('ssh: connect to host 1.2.3.4 port 22: Connection timed out')).toContain('did not answer');
    expect(explainSshFailure('ssh: connect to host 1.2.3.4 port 2222: Connection refused')).toContain('port');
    expect(explainSshFailure('ssh: Could not resolve hostname nope: Name or service not known')).toContain('does not resolve');
    expect(explainSshFailure('spawn ssh ENOENT')).toContain('ours to fix');
  });
});
