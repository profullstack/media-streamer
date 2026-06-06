import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractBearerToken, getCoinPayOAuthUserInfo } from './oauth';

describe('coinpayportal oauth', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('COINPAYPORTAL_OAUTH_BASE_URL', 'https://coinpay.test');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('extracts bearer tokens', () => {
    expect(extractBearerToken('Bearer token-123')).toBe('token-123');
    expect(extractBearerToken('bearer token-456')).toBe('token-456');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it('loads userinfo from CoinPayPortal OAuth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: 'coinpay-user-1',
        email: 'ALICE@example.com',
        email_verified: true,
        name: 'Alice',
        did: 'did:key:z6MkAlice',
        wallets: [{ chain: 'ETH', address: '0x123' }],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const user = await getCoinPayOAuthUserInfo('access-token');

    expect(mockFetch).toHaveBeenCalledWith('https://coinpay.test/api/oauth/userinfo', {
      headers: {
        Authorization: 'Bearer access-token',
        Accept: 'application/json',
      },
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(user).toEqual({
      sub: 'coinpay-user-1',
      email: 'alice@example.com',
      emailVerified: true,
      name: 'Alice',
      did: 'did:key:z6MkAlice',
      wallets: [{ chain: 'ETH', address: '0x123' }],
    });
  });

  it('returns null when the token is rejected', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await expect(getCoinPayOAuthUserInfo('bad-token')).resolves.toBeNull();
  });
});
