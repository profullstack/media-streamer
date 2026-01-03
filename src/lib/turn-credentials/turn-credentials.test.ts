/**
 * TURN Credentials Service Tests
 *
 * Tests for generating time-limited TURN credentials using HMAC-SHA1
 * These credentials are used by WebTorrent for WebRTC NAT traversal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateTurnCredentials,
  type TurnCredentials,
  type TurnIceServer,
  getTurnIceServers,
} from './turn-credentials.js';

describe('turn-credentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      TURN_SECRET: 'test-secret-key-for-hmac',
      TURN_REALM: 'test.example.com',
      NEXT_PUBLIC_TURN_SERVER_URL: 'turn:test.example.com:3478',
      TURN_CREDENTIAL_TTL: '3600',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateTurnCredentials', () => {
    it('should generate credentials with username containing timestamp and user ID', () => {
      const credentials = generateTurnCredentials('user-123');

      expect(credentials.username).toMatch(/^\d+:user-123$/);
    });

    it('should generate credentials with base64-encoded HMAC-SHA1 credential', () => {
      const credentials = generateTurnCredentials('user-123');

      // Base64 encoded HMAC-SHA1 should be 28 characters (20 bytes -> base64)
      expect(credentials.credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(credentials.credential.length).toBeGreaterThan(0);
    });

    it('should include TTL in the response', () => {
      const credentials = generateTurnCredentials('user-123');

      expect(credentials.ttl).toBe(3600);
    });

    it('should use default TTL of 86400 if not configured', () => {
      delete process.env.TURN_CREDENTIAL_TTL;

      const credentials = generateTurnCredentials('user-123');

      expect(credentials.ttl).toBe(86400);
    });

    it('should generate different credentials for different users', () => {
      const creds1 = generateTurnCredentials('user-1');
      const creds2 = generateTurnCredentials('user-2');

      expect(creds1.username).not.toBe(creds2.username);
      expect(creds1.credential).not.toBe(creds2.credential);
    });

    it('should generate credentials with future expiration timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const credentials = generateTurnCredentials('user-123');

      const timestamp = parseInt(credentials.username.split(':')[0], 10);
      expect(timestamp).toBeGreaterThan(now);
      expect(timestamp).toBeLessThanOrEqual(now + 3600 + 1); // Allow 1 second tolerance
    });

    it('should throw error if TURN_SECRET is not configured', () => {
      delete process.env.TURN_SECRET;

      expect(() => generateTurnCredentials('user-123')).toThrow(
        'TURN_SECRET environment variable is required'
      );
    });

    it('should use anonymous user ID if not provided', () => {
      const credentials = generateTurnCredentials();

      expect(credentials.username).toMatch(/^\d+:anonymous$/);
    });
  });

  describe('getTurnIceServers', () => {
    it('should return ICE servers with TURN URLs', () => {
      const iceServers = getTurnIceServers('user-123');

      expect(iceServers).toHaveLength(1);
      expect(iceServers[0].urls).toContain('turn:test.example.com:3478');
    });

    it('should include STUN URL alongside TURN', () => {
      const iceServers = getTurnIceServers('user-123');

      const urls = iceServers[0].urls;
      expect(urls).toContain('stun:test.example.com:3478');
    });

    it('should include TCP transport variant', () => {
      const iceServers = getTurnIceServers('user-123');

      const urls = iceServers[0].urls;
      expect(urls).toContain('turn:test.example.com:3478?transport=tcp');
    });

    it('should include credentials in ICE server config', () => {
      const iceServers = getTurnIceServers('user-123');

      expect(iceServers[0].username).toMatch(/^\d+:user-123$/);
      expect(iceServers[0].credential).toBeTruthy();
    });

    it('should return empty array if TURN server is not configured', () => {
      delete process.env.NEXT_PUBLIC_TURN_SERVER_URL;

      const iceServers = getTurnIceServers('user-123');

      expect(iceServers).toHaveLength(0);
    });

    it('should return empty array if TURN_SECRET is not configured', () => {
      delete process.env.TURN_SECRET;

      const iceServers = getTurnIceServers('user-123');

      expect(iceServers).toHaveLength(0);
    });
  });

  describe('credential verification', () => {
    it('should generate consistent credentials for same input at same time', () => {
      // Mock Date.now to ensure consistent timestamps
      const mockNow = 1704067200000; // 2024-01-01 00:00:00 UTC
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const creds1 = generateTurnCredentials('user-123');
      const creds2 = generateTurnCredentials('user-123');

      expect(creds1.username).toBe(creds2.username);
      expect(creds1.credential).toBe(creds2.credential);

      vi.restoreAllMocks();
    });

    it('should generate different credentials at different times', () => {
      const mockNow1 = 1704067200000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow1);
      const creds1 = generateTurnCredentials('user-123');

      const mockNow2 = 1704067201000; // 1 second later
      vi.spyOn(Date, 'now').mockReturnValue(mockNow2);
      const creds2 = generateTurnCredentials('user-123');

      // Timestamps should be different (1 second apart)
      expect(creds1.username).not.toBe(creds2.username);
      expect(creds1.credential).not.toBe(creds2.credential);

      vi.restoreAllMocks();
    });
  });
});
