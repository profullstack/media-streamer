/**
 * IPTV Cache Worker Config Tests
 */

import { describe, it, expect } from 'vitest';
import {
  REFRESH_INTERVAL_MS,
  CACHE_TTL_SECONDS,
  REDIS_KEYS,
  FETCH_CONFIG,
  EPG_CONFIG,
  LOG_PREFIX,
} from './config';

describe('IPTV Cache Worker Config', () => {
  describe('Timing constants', () => {
    it('refresh interval should be 15 minutes', () => {
      expect(REFRESH_INTERVAL_MS).toBe(15 * 60 * 1000);
    });

    it('cache TTL should be 20 minutes', () => {
      expect(CACHE_TTL_SECONDS).toBe(20 * 60);
    });

    it('cache TTL should be longer than refresh interval', () => {
      expect(CACHE_TTL_SECONDS * 1000).toBeGreaterThan(REFRESH_INTERVAL_MS);
    });
  });

  describe('REDIS_KEYS', () => {
    it('generates correct playlist meta key', () => {
      expect(REDIS_KEYS.playlistMeta('abc123')).toBe('iptv:worker:playlist:abc123:meta');
    });

    it('generates correct playlist channels key', () => {
      expect(REDIS_KEYS.playlistChannels('abc123')).toBe('iptv:worker:playlist:abc123:channels');
    });

    it('generates correct playlist groups key', () => {
      expect(REDIS_KEYS.playlistGroups('abc123')).toBe('iptv:worker:playlist:abc123:groups');
    });

    it('generates correct group channels key with encoding', () => {
      const key = REDIS_KEYS.playlistGroupChannels('abc123', 'Sports & News');
      expect(key).toBe('iptv:worker:playlist:abc123:group:Sports%20%26%20News');
    });

    it('generates correct EPG programs key', () => {
      expect(REDIS_KEYS.epgPrograms('abc123')).toBe('iptv:worker:epg:abc123:programs');
    });

    it('generates correct EPG now key', () => {
      expect(REDIS_KEYS.epgNow('abc123', 'ch1')).toBe('iptv:worker:epg:abc123:now:ch1');
    });

    it('generates correct EPG by channel key', () => {
      expect(REDIS_KEYS.epgByChannel('abc123', 'ch1')).toBe('iptv:worker:epg:abc123:channel:ch1');
    });

    it('has correct worker status key', () => {
      expect(REDIS_KEYS.workerStatus).toBe('iptv:worker:status');
    });

    it('has correct last run key', () => {
      expect(REDIS_KEYS.lastRun).toBe('iptv:worker:last_run');
    });

    it('has correct errors key', () => {
      expect(REDIS_KEYS.errors).toBe('iptv:worker:errors');
    });
  });

  describe('FETCH_CONFIG', () => {
    it('has a user agent', () => {
      expect(FETCH_CONFIG.userAgent).toBeTruthy();
      expect(typeof FETCH_CONFIG.userAgent).toBe('string');
    });

    it('has a reasonable timeout', () => {
      expect(FETCH_CONFIG.timeout).toBeGreaterThanOrEqual(30000);
      expect(FETCH_CONFIG.timeout).toBeLessThanOrEqual(120000);
    });

    it('has max retries configured', () => {
      expect(FETCH_CONFIG.maxRetries).toBeGreaterThanOrEqual(1);
      expect(FETCH_CONFIG.maxRetries).toBeLessThanOrEqual(5);
    });

    it('has retry base delay', () => {
      expect(FETCH_CONFIG.retryBaseDelay).toBeGreaterThan(0);
    });
  });

  describe('EPG_CONFIG', () => {
    it('limits programs per playlist', () => {
      expect(EPG_CONFIG.maxProgramsPerPlaylist).toBeGreaterThan(0);
    });

    it('has future hours limit', () => {
      expect(EPG_CONFIG.maxFutureHours).toBeGreaterThan(0);
    });

    it('has past hours limit', () => {
      expect(EPG_CONFIG.maxPastHours).toBeGreaterThan(0);
    });
  });

  describe('LOG_PREFIX', () => {
    it('has a log prefix', () => {
      expect(LOG_PREFIX).toBeTruthy();
      expect(typeof LOG_PREFIX).toBe('string');
    });
  });
});
