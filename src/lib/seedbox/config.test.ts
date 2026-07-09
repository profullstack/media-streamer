import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  availableTransports,
  getSeedboxConfig,
  isEmailAllowed,
  parseAllowedEmails,
} from './config';

const SEEDBOX_KEYS = [
  'SEEDBOX_ALLOWED_EMAILS',
  'SEEDBOX_HTTP_BASE_URL',
  'SEEDBOX_HTTP_TOKEN',
  'SEEDBOX_HTTP_ADD_PATH',
  'SEEDBOX_HTTP_AUTH',
  'SEEDBOX_HTTP_MAGNET_FIELD',
  'SEEDBOX_SSH_HOST',
  'SEEDBOX_SSH_PORT',
  'SEEDBOX_SSH_USER',
  'SEEDBOX_SSH_PRIVATE_KEY',
  'SEEDBOX_SSH_PRIVATE_KEY_PATH',
  'SEEDBOX_SSH_WATCH_DIR',
  'SEEDBOX_SSH_ADD_COMMAND',
];

describe('seedbox config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of SEEDBOX_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseAllowedEmails', () => {
    it('splits, trims, and lowercases', () => {
      expect(parseAllowedEmails('  A@x.com , b@Y.com ')).toEqual(['a@x.com', 'b@y.com']);
    });
    it('returns [] for empty/undefined', () => {
      expect(parseAllowedEmails('')).toEqual([]);
      expect(parseAllowedEmails(null)).toEqual([]);
    });
  });

  describe('isEmailAllowed', () => {
    it('fails closed when no allowlist is set', () => {
      const config = getSeedboxConfig();
      expect(isEmailAllowed(config, 'anyone@x.com')).toBe(false);
    });
    it('is case-insensitive on the allowlist', () => {
      process.env.SEEDBOX_ALLOWED_EMAILS = 'ops@x.com';
      const config = getSeedboxConfig();
      expect(isEmailAllowed(config, 'OPS@x.com')).toBe(true);
      expect(isEmailAllowed(config, 'other@x.com')).toBe(false);
      expect(isEmailAllowed(config, null)).toBe(false);
    });
  });

  describe('HTTP transport activation', () => {
    it('is null unless both base URL and token are present', () => {
      process.env.SEEDBOX_HTTP_BASE_URL = 'https://box.example.com';
      expect(getSeedboxConfig().http).toBeNull();
      process.env.SEEDBOX_HTTP_TOKEN = 'tok';
      const http = getSeedboxConfig().http;
      expect(http).not.toBeNull();
      expect(http?.baseUrl).toBe('https://box.example.com');
      expect(http?.addPath).toBe('/add');
      expect(http?.magnetField).toBe('magnet');
      expect(http?.auth).toEqual({ kind: 'bearer' });
    });

    it('strips trailing slashes and parses a custom header auth', () => {
      process.env.SEEDBOX_HTTP_BASE_URL = 'https://box.example.com///';
      process.env.SEEDBOX_HTTP_TOKEN = 'tok';
      process.env.SEEDBOX_HTTP_AUTH = 'header:X-Api-Key';
      const http = getSeedboxConfig().http;
      expect(http?.baseUrl).toBe('https://box.example.com');
      expect(http?.auth).toEqual({ kind: 'header', header: 'X-Api-Key' });
    });
  });

  describe('SSH transport activation', () => {
    it('requires host, user, a key, and a delivery mode', () => {
      process.env.SEEDBOX_SSH_HOST = 'box.example.com';
      process.env.SEEDBOX_SSH_USER = 'seedbox-mgr';
      expect(getSeedboxConfig().ssh).toBeNull(); // no key, no mode
      process.env.SEEDBOX_SSH_PRIVATE_KEY = 'KEY';
      expect(getSeedboxConfig().ssh).toBeNull(); // still no delivery mode
      process.env.SEEDBOX_SSH_WATCH_DIR = '/home/user/watch';
      const ssh = getSeedboxConfig().ssh;
      expect(ssh).not.toBeNull();
      expect(ssh?.host).toBe('box.example.com');
      expect(ssh?.port).toBe(22);
      expect(ssh?.watchDir).toBe('/home/user/watch');
    });

    it('parses a custom port and falls back on garbage', () => {
      process.env.SEEDBOX_SSH_HOST = 'box';
      process.env.SEEDBOX_SSH_USER = 'u';
      process.env.SEEDBOX_SSH_PRIVATE_KEY_PATH = '/k';
      process.env.SEEDBOX_SSH_ADD_COMMAND = 'torlink add {magnet}';
      process.env.SEEDBOX_SSH_PORT = '2222';
      expect(getSeedboxConfig().ssh?.port).toBe(2222);
      process.env.SEEDBOX_SSH_PORT = 'nonsense';
      expect(getSeedboxConfig().ssh?.port).toBe(22);
    });
  });

  describe('availableTransports', () => {
    it('reflects which transports are configured', () => {
      expect(availableTransports(getSeedboxConfig())).toEqual([]);
      process.env.SEEDBOX_HTTP_BASE_URL = 'https://box';
      process.env.SEEDBOX_HTTP_TOKEN = 'tok';
      expect(availableTransports(getSeedboxConfig())).toEqual(['http']);
      process.env.SEEDBOX_SSH_HOST = 'box';
      process.env.SEEDBOX_SSH_USER = 'u';
      process.env.SEEDBOX_SSH_PRIVATE_KEY = 'k';
      process.env.SEEDBOX_SSH_WATCH_DIR = '/w';
      expect(availableTransports(getSeedboxConfig())).toEqual(['http', 'ssh']);
    });
  });
});
