/**
 * Tests for Temp Directory Configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// We need to test the module with different env vars, so we'll test the logic directly
describe('Temp Directory Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset modules to get fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete (process.env as Record<string, string | undefined>)[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('getTempDir', () => {
    it('should return TEMP_DIR env var if set', async () => {
      (process.env as Record<string, string | undefined>).TEMP_DIR = '/custom/temp/dir';
      const { getTempDir } = await import('./temp-dir');
      expect(getTempDir()).toBe('/custom/temp/dir');
    });

    it('should return $HOME/tmp in production', async () => {
      delete (process.env as Record<string, string | undefined>).TEMP_DIR;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const { getTempDir } = await import('./temp-dir');
      expect(getTempDir()).toBe(join(homedir(), 'tmp'));
    });

    it('should return $HOME/tmp in development (consistent with production)', async () => {
      delete (process.env as Record<string, string | undefined>).TEMP_DIR;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      const { getTempDir } = await import('./temp-dir');
      // Always use $HOME/tmp for consistency across environments
      expect(getTempDir()).toBe(join(homedir(), 'tmp'));
    });

    it('should return $HOME/tmp when NODE_ENV is not set', async () => {
      delete (process.env as Record<string, string | undefined>).TEMP_DIR;
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
      const { getTempDir } = await import('./temp-dir');
      // Always use $HOME/tmp for consistency across environments
      expect(getTempDir()).toBe(join(homedir(), 'tmp'));
    });
  });

  describe('getWebTorrentDir', () => {
    it('should return webtorrent subdirectory of temp dir', async () => {
      (process.env as Record<string, string | undefined>).TEMP_DIR = '/custom/temp';
      const { getWebTorrentDir } = await import('./temp-dir');
      expect(getWebTorrentDir()).toBe('/custom/temp/webtorrent');
    });

    it('should use $HOME/tmp/webtorrent in production', async () => {
      delete (process.env as Record<string, string | undefined>).TEMP_DIR;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const { getWebTorrentDir } = await import('./temp-dir');
      expect(getWebTorrentDir()).toBe(join(homedir(), 'tmp', 'webtorrent'));
    });
  });

  describe('getTranscodingDir', () => {
    it('should return transcoding subdirectory of temp dir', async () => {
      (process.env as Record<string, string | undefined>).TEMP_DIR = '/custom/temp';
      const { getTranscodingDir } = await import('./temp-dir');
      expect(getTranscodingDir()).toBe('/custom/temp/media-torrent-transcoding');
    });

    it('should use $HOME/tmp/media-torrent-transcoding in production', async () => {
      delete (process.env as Record<string, string | undefined>).TEMP_DIR;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const { getTranscodingDir } = await import('./temp-dir');
      expect(getTranscodingDir()).toBe(join(homedir(), 'tmp', 'media-torrent-transcoding'));
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const { ensureDir } = await import('./temp-dir');
      const testDir = join(tmpdir(), 'test-ensure-dir-' + Date.now());
      
      // Should not throw
      expect(() => ensureDir(testDir)).not.toThrow();
      
      // Directory should exist now
      const { existsSync } = await import('node:fs');
      expect(existsSync(testDir)).toBe(true);
      
      // Cleanup
      const { rmSync } = await import('node:fs');
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should not throw if directory already exists', async () => {
      const { ensureDir } = await import('./temp-dir');
      const testDir = join(tmpdir(), 'test-ensure-dir-exists-' + Date.now());
      
      // Create directory first
      const { mkdirSync } = await import('node:fs');
      mkdirSync(testDir, { recursive: true });
      
      // Should not throw when called on existing directory
      expect(() => ensureDir(testDir)).not.toThrow();
      
      // Cleanup
      const { rmSync } = await import('node:fs');
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('initTempDirs', () => {
    it('should create all temp directories', async () => {
      const testBase = join(tmpdir(), 'test-init-temp-dirs-' + Date.now());
      (process.env as Record<string, string | undefined>).TEMP_DIR = testBase;
      
      const { initTempDirs, getWebTorrentDir, getTranscodingDir } = await import('./temp-dir');
      
      // Should not throw
      expect(() => initTempDirs()).not.toThrow();
      
      // All directories should exist
      const { existsSync } = await import('node:fs');
      expect(existsSync(testBase)).toBe(true);
      expect(existsSync(getWebTorrentDir())).toBe(true);
      expect(existsSync(getTranscodingDir())).toBe(true);
      
      // Cleanup
      const { rmSync } = await import('node:fs');
      rmSync(testBase, { recursive: true, force: true });
    });
  });
});
