import { describe, it, expect } from 'vitest';

import {
  availableTransports,
  buildFilesConfig,
  buildHttpConfig,
  buildSshConfig,
  emptySeedboxConfig,
  hasSeedbox,
  parseHttpAuth,
  type SeedboxConfig,
} from './config';

describe('seedbox config builders', () => {
  describe('buildHttpConfig', () => {
    it('is null unless both base URL and token are present', () => {
      expect(buildHttpConfig({ baseUrl: 'https://box.example.com' })).toBeNull();
      expect(buildHttpConfig({ token: 'tok' })).toBeNull();
      const http = buildHttpConfig({ baseUrl: 'https://box.example.com', token: 'tok' });
      expect(http).not.toBeNull();
      expect(http?.baseUrl).toBe('https://box.example.com');
      expect(http?.addPath).toBe('/add');
      expect(http?.magnetField).toBe('magnet');
      expect(http?.auth).toEqual({ kind: 'bearer' });
    });

    it('strips trailing slashes and parses a custom header auth', () => {
      const http = buildHttpConfig({
        baseUrl: 'https://box.example.com///',
        token: 'tok',
        auth: 'header:X-Api-Key',
      });
      expect(http?.baseUrl).toBe('https://box.example.com');
      expect(http?.auth).toEqual({ kind: 'header', header: 'X-Api-Key' });
    });
  });

  describe('parseHttpAuth', () => {
    it('defaults to bearer and parses header specs', () => {
      expect(parseHttpAuth(null)).toEqual({ kind: 'bearer' });
      expect(parseHttpAuth('bearer')).toEqual({ kind: 'bearer' });
      expect(parseHttpAuth('header:X-Key')).toEqual({ kind: 'header', header: 'X-Key' });
      expect(parseHttpAuth('garbage')).toEqual({ kind: 'bearer' });
    });
  });

  describe('buildSshConfig', () => {
    it('requires host, user, a key, and a delivery mode', () => {
      expect(buildSshConfig({ host: 'box', user: 'u' })).toBeNull(); // no key, no mode
      expect(buildSshConfig({ host: 'box', user: 'u', privateKey: 'KEY' })).toBeNull(); // no mode
      const ssh = buildSshConfig({ host: 'box', user: 'u', privateKey: 'KEY', watchDir: '/home/user/watch' });
      expect(ssh).not.toBeNull();
      expect(ssh?.host).toBe('box');
      expect(ssh?.port).toBe(22);
      expect(ssh?.watchDir).toBe('/home/user/watch');
    });

    it('parses a numeric or string port and falls back on garbage', () => {
      const base = { host: 'box', user: 'u', privateKeyPath: '/k', addCommand: 'torlink add {magnet}' };
      expect(buildSshConfig({ ...base, port: 2222 })?.port).toBe(2222);
      expect(buildSshConfig({ ...base, port: '2222' })?.port).toBe(2222);
      expect(buildSshConfig({ ...base, port: 'nonsense' })?.port).toBe(22);
      expect(buildSshConfig({ ...base })?.port).toBe(22);
    });
  });

  describe('buildFilesConfig', () => {
    it('is null without a base URL and defaults to no auth', () => {
      expect(buildFilesConfig({})).toBeNull();
      const files = buildFilesConfig({ baseUrl: 'http://box:9160//' });
      expect(files?.baseUrl).toBe('http://box:9160');
      expect(files?.auth).toEqual({ kind: 'none' });
    });

    it('parses bearer and basic auth', () => {
      expect(buildFilesConfig({ baseUrl: 'http://b', auth: 'bearer', token: 't' })?.auth).toEqual({
        kind: 'bearer',
        token: 't',
      });
      expect(
        buildFilesConfig({ baseUrl: 'http://b', auth: 'basic', basicUser: 'u', basicPass: 'p' })?.auth
      ).toEqual({ kind: 'basic', user: 'u', pass: 'p' });
      // basic without both parts falls back to none
      expect(buildFilesConfig({ baseUrl: 'http://b', auth: 'basic', basicUser: 'u' })?.auth).toEqual({
        kind: 'none',
      });
    });
  });

  describe('availableTransports & hasSeedbox', () => {
    it('reflects which transports are configured', () => {
      const empty = emptySeedboxConfig();
      expect(availableTransports(empty)).toEqual([]);
      expect(hasSeedbox(empty)).toBe(false);
      expect(hasSeedbox(null)).toBe(false);

      const httpOnly: SeedboxConfig = {
        http: buildHttpConfig({ baseUrl: 'https://box', token: 'tok' }),
        ssh: null,
        files: null,
      };
      expect(availableTransports(httpOnly)).toEqual(['http']);
      expect(hasSeedbox(httpOnly)).toBe(true);

      const both: SeedboxConfig = {
        http: buildHttpConfig({ baseUrl: 'https://box', token: 'tok' }),
        ssh: buildSshConfig({ host: 'box', user: 'u', privateKey: 'k', watchDir: '/w' }),
        files: null,
      };
      expect(availableTransports(both)).toEqual(['http', 'ssh']);

      // files-only counts as "has seedbox" but exposes no send transports
      const filesOnly: SeedboxConfig = { http: null, ssh: null, files: buildFilesConfig({ baseUrl: 'http://b' }) };
      expect(availableTransports(filesOnly)).toEqual([]);
      expect(hasSeedbox(filesOnly)).toBe(true);
    });
  });
});
