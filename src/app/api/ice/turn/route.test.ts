/**
 * TURN Credentials API Route Tests
 *
 * Tests for the /api/turn-credentials endpoint that provides
 * time-limited TURN credentials for WebRTC NAT traversal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route.js';

describe('/api/turn-credentials', () => {
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

  describe('GET', () => {
    it('should return ICE servers with TURN credentials', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.iceServers).toBeDefined();
      expect(data.iceServers).toHaveLength(1);
    });

    it('should include STUN and TURN URLs', async () => {
      const response = await GET();
      const data = await response.json();

      const urls = data.iceServers[0].urls;
      expect(urls).toContain('stun:test.example.com:3478');
      expect(urls).toContain('turn:test.example.com:3478');
      expect(urls).toContain('turn:test.example.com:3478?transport=tcp');
    });

    it('should include username with timestamp', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.iceServers[0].username).toMatch(/^\d+:anonymous$/);
    });

    it('should include credential', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.iceServers[0].credential).toBeTruthy();
      // Base64 encoded HMAC-SHA1
      expect(data.iceServers[0].credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should include TTL in response', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.ttl).toBe(3600);
    });

    it('should return empty iceServers if TURN is not configured', async () => {
      delete process.env.NEXT_PUBLIC_TURN_SERVER_URL;

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.iceServers).toHaveLength(0);
    });

    it('should return empty iceServers if TURN_SECRET is not configured', async () => {
      delete process.env.TURN_SECRET;

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.iceServers).toHaveLength(0);
    });

    it('should set appropriate cache headers', async () => {
      const response = await GET();

      // Should have short cache time since credentials expire
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('max-age=');
      expect(cacheControl).toContain('private');
    });

    it('should set CORS headers for browser access', async () => {
      const response = await GET();

      // Should allow browser access
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });
  });
});
