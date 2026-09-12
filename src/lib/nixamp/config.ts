/**
 * nixamp.com OAuth 2.1 configuration.
 *
 * nixamp is the authorization server and bittorrented.com is the client: nixamp
 * keeps the accounts, the revocable tokens and the handles, and we keep the
 * films. A watch party here becomes a room there, under the same person.
 *
 * Env vars, all optional except in production:
 * - NIXAMP_SITE                  default https://nixamp.com
 * - NIXAMP_CLIENT_ID             default `bittorrented`, which nixamp ships knowing
 * - NIXAMP_CLIENT_SECRET         only for a confidential registration; PKCE covers us without one
 * - NIXAMP_OAUTH_REDIRECT_URI    default <app url>/api/v1/nixamp/oauth/callback
 *
 * Read inside a function, never into an exported module-level const: Next
 * statically replaces `process.env.X` at build time, so a secret captured at
 * the top of a module compiles in as whatever it was during the build.
 */

/** Where nixamp lives. */
export const NIXAMP_DEFAULT_SITE = 'https://nixamp.com';

/** The client id nixamp registers for bittorrented.com out of the box. */
export const NIXAMP_DEFAULT_CLIENT_ID = 'bittorrented';

/**
 * What we ask for, and why.
 *
 * `profile` is the handle, which is what a party shows other people --
 * never the account email, which on nixamp is a credential rather than a
 * name. `parties` is the whole point. `offline_access` keeps the connection
 * alive across the hour an access token lives, so somebody who connected on
 * Monday can still host on Friday without approving again.
 */
export const NIXAMP_SCOPES = ['profile', 'parties', 'offline_access'] as const;

/** Cookie holding the PKCE verifier and CSRF state during the round trip. */
export const NIXAMP_OAUTH_STATE_COOKIE = 'nixamp_oauth';

/** How long that cookie is worth anything. A consent screen is not a long read. */
export const NIXAMP_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export interface NixampOAuthConfig {
  /** https://nixamp.com, with no trailing slash. */
  site: string;
  clientId: string;
  /** Empty for a public client, which is what PKCE makes possible. */
  clientSecret: string;
  redirectUri: string;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Our own public origin, however this deployment spells it. */
export function getAppOrigin(fallback = ''): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  return trimSlash(configured || fallback);
}

/**
 * The configuration, or a thrown error naming exactly what is missing.
 *
 * `fallbackOrigin` is the request's own origin, used only to build a default
 * redirect URI in development. In production the redirect URI has to match
 * what nixamp has registered, byte for byte, so it is worth setting.
 */
export function getNixampOAuthConfig(fallbackOrigin = ''): NixampOAuthConfig {
  const site = trimSlash(process.env.NIXAMP_SITE || NIXAMP_DEFAULT_SITE);
  const clientId = process.env.NIXAMP_CLIENT_ID || NIXAMP_DEFAULT_CLIENT_ID;
  const origin = getAppOrigin(fallbackOrigin);
  const redirectUri = process.env.NIXAMP_OAUTH_REDIRECT_URI || (origin ? `${origin}/api/v1/nixamp/oauth/callback` : '');

  if (!redirectUri) {
    throw new Error(
      'Cannot build the nixamp OAuth redirect URI. Set NIXAMP_OAUTH_REDIRECT_URI, or NEXT_PUBLIC_APP_URL.'
    );
  }

  return {
    site,
    clientId,
    clientSecret: process.env.NIXAMP_CLIENT_SECRET || '',
    redirectUri,
  };
}

/** Is a nixamp connection configured enough to offer at all? */
export function isNixampConfigured(fallbackOrigin = ''): boolean {
  try {
    getNixampOAuthConfig(fallbackOrigin);
    return true;
  } catch {
    return false;
  }
}
