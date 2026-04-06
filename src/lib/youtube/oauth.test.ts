import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildAuthUrl,
  generateState,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchGoogleUserInfo,
  computeExpiresAt,
} from './oauth';

const config = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://example.com/api/youtube/auth/callback',
};

describe('youtube/oauth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildAuthUrl', () => {
    it('includes required OAuth params and scopes', () => {
      const url = buildAuthUrl(config, 'state123');
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(parsed.searchParams.get('client_id')).toBe(config.clientId);
      expect(parsed.searchParams.get('redirect_uri')).toBe(config.redirectUri);
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
      expect(parsed.searchParams.get('state')).toBe('state123');
      expect(parsed.searchParams.get('scope')).toContain('youtube.readonly');
    });
  });

  describe('generateState', () => {
    it('returns a 64-char hex string', () => {
      const s = generateState();
      expect(s).toMatch(/^[0-9a-f]{64}$/);
    });
    it('returns a unique value each call', () => {
      expect(generateState()).not.toBe(generateState());
    });
  });

  describe('computeExpiresAt', () => {
    it('adds seconds to the given now', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      expect(computeExpiresAt(3600, now)).toBe('2026-01-01T01:00:00.000Z');
    });
  });

  describe('exchangeCodeForTokens', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('POSTs to the token endpoint and returns parsed JSON', async () => {
      const mockResponse = {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'openid email',
        token_type: 'Bearer',
      };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await exchangeCodeForTokens(config, 'code-abc');
      expect(result).toEqual(mockResponse);

      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe('https://oauth2.googleapis.com/token');
      expect(call[1].method).toBe('POST');
      const body = call[1].body as URLSearchParams;
      expect(body.get('code')).toBe('code-abc');
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_id')).toBe(config.clientId);
    });

    it('throws when Google returns an error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });
      await expect(exchangeCodeForTokens(config, 'bad')).rejects.toThrow(/invalid_grant/);
    });
  });

  describe('refreshAccessToken', () => {
    it('sends refresh_token grant', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-at',
          expires_in: 3600,
          scope: 'openid',
          token_type: 'Bearer',
        }),
      });
      const result = await refreshAccessToken(config, 'rt-123');
      expect(result.access_token).toBe('new-at');
      const body = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('rt-123');
    });
  });

  describe('fetchGoogleUserInfo', () => {
    it('calls userinfo endpoint with bearer token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: '123', email: 'a@b.c', name: 'A', picture: 'p' }),
      });
      const info = await fetchGoogleUserInfo('at');
      expect(info.sub).toBe('123');
      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].headers.Authorization).toBe('Bearer at');
    });
  });
});
