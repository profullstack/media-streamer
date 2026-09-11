/**
 * The OAuth 2.1 client half: PKCE, the code exchange, and refresh rotation.
 *
 * Plain fetch, no SDK, in the shape `src/lib/youtube/oauth.ts` already uses.
 * What is new here is PKCE, which nothing else in this repo does, and which
 * OAuth 2.1 requires of every client -- including a confidential one. The
 * verifier never leaves this origin: it goes into an httpOnly cookie on the
 * way out and comes back out of it to be spent once at the token endpoint.
 *
 * The other 2.1 difference worth knowing when reading this: nixamp ROTATES
 * refresh tokens. Every refresh answers a new one and retires the old, and
 * presenting a retired one withdraws the whole family. So `refreshTokens`
 * always writes the new refresh token back, and a failure means the
 * connection is gone rather than that it should be retried.
 */

import type { NixampOAuthConfig } from './config';
import { NIXAMP_SCOPES } from './config';

export interface NixampTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface NixampUserInfo {
  sub: string;
  client_id?: string;
  scope?: string;
  handle?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
}

/** RFC 8414: where a client is meant to look for the endpoints. */
export interface NixampMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A PKCE verifier: 43 to 128 unreserved characters (RFC 7636 §4.1). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** S256, which is the only method OAuth 2.1 allows. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** An opaque CSRF state. Separate from the verifier on purpose: different jobs. */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** The endpoints, straight from the well-known document, with the spelled-out fallback. */
export async function discover(config: NixampOAuthConfig, fetcher: typeof fetch = fetch): Promise<NixampMetadata> {
  const fallback: NixampMetadata = {
    issuer: config.site,
    authorization_endpoint: `${config.site}/api/v1/oauth/authorize`,
    token_endpoint: `${config.site}/api/v1/oauth/token`,
    revocation_endpoint: `${config.site}/api/v1/oauth/revoke`,
    userinfo_endpoint: `${config.site}/api/v1/oauth/userinfo`,
  };
  try {
    const res = await fetcher(`${config.site}/.well-known/oauth-authorization-server`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as Partial<NixampMetadata>;
    // An issuer that is not the site we asked is a document we must not
    // follow: it would point our token exchange at somebody else's server.
    if (body.issuer !== config.site) return fallback;
    return {
      issuer: body.issuer,
      authorization_endpoint: body.authorization_endpoint ?? fallback.authorization_endpoint,
      token_endpoint: body.token_endpoint ?? fallback.token_endpoint,
      revocation_endpoint: body.revocation_endpoint ?? fallback.revocation_endpoint,
      userinfo_endpoint: body.userinfo_endpoint ?? fallback.userinfo_endpoint,
      ...(body.code_challenge_methods_supported
        ? { code_challenge_methods_supported: body.code_challenge_methods_supported }
        : {}),
      ...(body.grant_types_supported ? { grant_types_supported: body.grant_types_supported } : {}),
    };
  } catch {
    // nixamp being unreachable is not a reason to be unable to build a URL.
    return fallback;
  }
}

/** Where to send the browser. */
export function buildAuthUrl(
  config: NixampOAuthConfig,
  metadata: NixampMetadata,
  state: string,
  challenge: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: NIXAMP_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${metadata.authorization_endpoint}?${params.toString()}`;
}

async function postForm(
  url: string,
  body: URLSearchParams,
  config: NixampOAuthConfig,
  fetcher: typeof fetch
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (config.clientSecret) {
    // A registration that has a secret authenticates with it; a public one
    // presents only its id, and PKCE is what makes that safe.
    headers.Authorization = `Basic ${btoa(
      `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`
    )}`;
  }
  return fetcher(url, { method: 'POST', headers, body });
}

export class NixampOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'NixampOAuthError';
  }
}

async function readTokens(res: Response): Promise<NixampTokenResponse> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== 'string') {
    const code = typeof body.error === 'string' ? body.error : `http_${res.status}`;
    const description = typeof body.error_description === 'string' ? body.error_description : 'nixamp refused the exchange';
    throw new NixampOAuthError(description, code);
  }
  return {
    access_token: body.access_token,
    token_type: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    expires_in: typeof body.expires_in === 'number' ? body.expires_in : 3600,
    ...(typeof body.refresh_token === 'string' ? { refresh_token: body.refresh_token } : {}),
    scope: typeof body.scope === 'string' ? body.scope : '',
  };
}

/** Spend the code, with the verifier that proves we are who started this. */
export async function exchangeCodeForTokens(
  config: NixampOAuthConfig,
  metadata: NixampMetadata,
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch
): Promise<NixampTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  return readTokens(await postForm(metadata.token_endpoint, body, config, fetcher));
}

/**
 * A new pair. The answer ALWAYS carries a new refresh token, and storing it
 * is not optional: nixamp retires the one just used, and presenting a retired
 * token again withdraws every token in the family.
 */
export async function refreshTokens(
  config: NixampOAuthConfig,
  metadata: NixampMetadata,
  refreshToken: string,
  fetcher: typeof fetch = fetch
): Promise<NixampTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  });
  return readTokens(await postForm(metadata.token_endpoint, body, config, fetcher));
}

/** Hand a token back, when somebody disconnects from this side. */
export async function revokeToken(
  config: NixampOAuthConfig,
  metadata: NixampMetadata,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  if (!metadata.revocation_endpoint) return;
  const body = new URLSearchParams({ client_id: config.clientId, token });
  await postForm(metadata.revocation_endpoint, body, config, fetcher).catch(() => undefined);
}

/** Who the token belongs to on nixamp. The handle is the public name; the id is the link. */
export async function fetchUserInfo(
  metadata: NixampMetadata,
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<NixampUserInfo> {
  const res = await fetcher(metadata.userinfo_endpoint ?? `${metadata.issuer}/api/v1/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) throw new NixampOAuthError(`nixamp userinfo failed (${res.status})`, 'userinfo_failed');
  const body = (await res.json()) as Record<string, unknown>;
  if (typeof body.sub !== 'string' || !body.sub) {
    throw new NixampOAuthError('nixamp did not say who this is', 'no_subject');
  }
  return {
    sub: body.sub,
    ...(typeof body.client_id === 'string' ? { client_id: body.client_id } : {}),
    ...(typeof body.scope === 'string' ? { scope: body.scope } : {}),
    ...(typeof body.handle === 'string' ? { handle: body.handle } : {}),
    ...(typeof body.preferred_username === 'string' ? { preferred_username: body.preferred_username } : {}),
    ...(typeof body.email === 'string' ? { email: body.email } : {}),
    ...(typeof body.email_verified === 'boolean' ? { email_verified: body.email_verified } : {}),
  };
}

/** When an access token stops being worth presenting, with a minute of slack. */
export function computeExpiresAt(expiresIn: number, now = Date.now()): Date {
  return new Date(now + Math.max(0, expiresIn - 60) * 1000);
}
