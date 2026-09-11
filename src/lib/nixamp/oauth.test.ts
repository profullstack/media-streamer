/**
 * The OAuth 2.1 client half: PKCE, discovery, the exchange and rotation.
 *
 * Nothing here touches Supabase — the storage side is exercised through the
 * route tests. What is under test is the wire: that a challenge really is the
 * S256 of the verifier, that discovery refuses a document claiming to be
 * somebody else, and that a rotation failure is reported as such rather than
 * swallowed.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  NixampOAuthError,
  buildAuthUrl,
  codeChallenge,
  computeExpiresAt,
  discover,
  exchangeCodeForTokens,
  fetchUserInfo,
  generateCodeVerifier,
  generateState,
  refreshTokens,
  type NixampMetadata,
} from './oauth';
import type { NixampOAuthConfig } from './config';

const config: NixampOAuthConfig = {
  site: 'https://nixamp.test',
  clientId: 'bittorrented',
  clientSecret: '',
  redirectUri: 'https://bittorrented.test/api/v1/nixamp/oauth/callback',
};

const metadata: NixampMetadata = {
  issuer: 'https://nixamp.test',
  authorization_endpoint: 'https://nixamp.test/api/v1/oauth/authorize',
  token_endpoint: 'https://nixamp.test/api/v1/oauth/token',
  revocation_endpoint: 'https://nixamp.test/api/v1/oauth/revoke',
  userinfo_endpoint: 'https://nixamp.test/api/v1/oauth/userinfo',
};

function answering(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;
}

describe('PKCE', () => {
  it('makes a verifier of the length and alphabet RFC 7636 allows', () => {
    for (let i = 0; i < 10; i += 1) {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    }
  });

  it('makes a challenge that is the base64url SHA-256 of the verifier', async () => {
    const challenge = await codeChallenge('a'.repeat(43));
    // The known value, cross-checked against Node's crypto -- which is what
    // nixamp's own AuthorizationServer uses. Nothing about this may drift:
    // nixamp computes the same digest and compares the two, so a WebCrypto
    // implementation that disagreed here would fail every exchange.
    expect(challenge).toBe('ZtNPunH49FD35FWYhT5Tv8I7vRKQJ8uxMaL0_9eHjNA');
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    // A different verifier is a different challenge.
    expect(await codeChallenge('b'.repeat(43))).not.toBe(challenge);
  });

  it('makes a state that is separate from the verifier', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('the authorization URL', () => {
  it('carries PKCE, the exact redirect URI, and only the scopes we ask for', async () => {
    const url = new URL(buildAuthUrl(config, metadata, 'st4te', await codeChallenge('c'.repeat(43))));
    expect(url.origin + url.pathname).toBe('https://nixamp.test/api/v1/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toBe('profile parties offline_access');
    expect(url.searchParams.get('state')).toBe('st4te');
  });
});

describe('discovery', () => {
  it('takes the endpoints from the well-known document', async () => {
    const fetcher = answering({
      issuer: 'https://nixamp.test',
      authorization_endpoint: 'https://nixamp.test/elsewhere/authorize',
      token_endpoint: 'https://nixamp.test/elsewhere/token',
    });
    const found = await discover(config, fetcher);
    expect(found.authorization_endpoint).toBe('https://nixamp.test/elsewhere/authorize');
    expect(found.token_endpoint).toBe('https://nixamp.test/elsewhere/token');
  });

  it('refuses a document that claims to be a different issuer', async () => {
    // Following this would point our token exchange, with our code, at
    // somebody else's server.
    const fetcher = answering({
      issuer: 'https://evil.test',
      token_endpoint: 'https://evil.test/token',
    });
    const found = await discover(config, fetcher);
    expect(found.token_endpoint).toBe('https://nixamp.test/api/v1/oauth/token');
  });

  it('falls back to the spelled-out endpoints when nixamp cannot be reached', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const found = await discover(config, fetcher);
    expect(found.authorization_endpoint).toBe('https://nixamp.test/api/v1/oauth/authorize');
  });
});

describe('the token endpoint', () => {
  it('sends the verifier and the exact redirect URI with the code', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code_verifier')).toBe('v'.repeat(43));
      expect(body.get('redirect_uri')).toBe(config.redirectUri);
      expect(body.get('client_id')).toBe('bittorrented');
      // A public client sends no secret, and PKCE is what replaces it.
      expect(body.get('client_secret')).toBeNull();
      return new Response(
        JSON.stringify({ access_token: 'nxa_1_a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'nxr_1_b', scope: 'profile parties offline_access' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const tokens = await exchangeCodeForTokens(config, metadata, 'the-code', 'v'.repeat(43), fetcher);
    expect(tokens.access_token).toBe('nxa_1_a');
    expect(tokens.refresh_token).toBe('nxr_1_b');
  });

  it('authenticates with basic auth only when there is a secret to send', async () => {
    const seen: (string | undefined)[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)?.Authorization);
      return new Response(JSON.stringify({ access_token: 'nxa_x_y', expires_in: 60, scope: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await exchangeCodeForTokens(config, metadata, 'c', 'v'.repeat(43), fetcher);
    await exchangeCodeForTokens({ ...config, clientSecret: 'sh' }, metadata, 'c', 'v'.repeat(43), fetcher);
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toMatch(/^Basic /);
  });

  it('reports nixamp’s own refusal rather than a generic failure', async () => {
    const fetcher = answering({ error: 'invalid_grant', error_description: 'that code was already used' }, 400);
    await expect(exchangeCodeForTokens(config, metadata, 'c', 'v'.repeat(43), fetcher)).rejects.toThrow(
      /that code was already used/
    );
    await expect(exchangeCodeForTokens(config, metadata, 'c', 'v'.repeat(43), fetcher)).rejects.toBeInstanceOf(
      NixampOAuthError
    );
  });

  it('refuses a 200 that carries no access token', async () => {
    const fetcher = answering({ token_type: 'Bearer' });
    await expect(exchangeCodeForTokens(config, metadata, 'c', 'v'.repeat(43), fetcher)).rejects.toThrow();
  });
});

describe('refresh rotation', () => {
  it('always answers the new refresh token, which the caller must store', async () => {
    const fetcher = answering({
      access_token: 'nxa_2_a',
      refresh_token: 'nxr_2_b',
      expires_in: 3600,
      scope: 'profile parties offline_access',
    });
    const next = await refreshTokens(config, metadata, 'nxr_1_b', fetcher);
    expect(next.refresh_token).toBe('nxr_2_b');
    expect(next.access_token).toBe('nxa_2_a');
  });

  it('throws when the token was already rotated, so the caller can stop trying', async () => {
    const fetcher = answering({ error: 'invalid_grant', error_description: 'that refresh token was already used' }, 400);
    await expect(refreshTokens(config, metadata, 'nxr_1_b', fetcher)).rejects.toThrow(/already used/);
  });
});

describe('userinfo', () => {
  it('takes the handle as the public name and leaves the address alone', async () => {
    const fetcher = answering({ sub: 'user-1', handle: 'chovy', scope: 'profile parties' });
    const who = await fetchUserInfo(metadata, 'nxa_1_a', fetcher);
    expect(who.sub).toBe('user-1');
    expect(who.handle).toBe('chovy');
    // No email scope was granted, so no address comes back to be stored.
    expect(who.email).toBeUndefined();
  });

  it('refuses an answer that does not say who it is', async () => {
    await expect(fetchUserInfo(metadata, 'nxa_1_a', answering({ handle: 'chovy' }))).rejects.toThrow(/who this is/);
  });
});

describe('expiry', () => {
  it('retires a token a minute before nixamp would, so a call in flight is not refused', () => {
    const at = computeExpiresAt(3600, 0);
    expect(at.getTime()).toBe(3540 * 1000);
    // Never in the past, however small the lifetime nixamp reported.
    expect(computeExpiresAt(10, 0).getTime()).toBe(0);
  });
});
