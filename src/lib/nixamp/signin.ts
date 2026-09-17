/**
 * Sign in with nixamp.
 *
 * nixamp.com is the authorization server and, for somebody who arrives from
 * it -- a party link in the nixamp app, a terminal, a television -- it is
 * also who they are. The OAuth 2.1 round trip proves an email address they
 * hold on nixamp; the account here with that address is theirs, made on the
 * spot if there is none, and a session for it is minted without a password
 * ever existing on this side.
 *
 * The session is a real Supabase session, the same as a password login
 * makes, so nothing downstream -- the members gate, the profile check, every
 * API route -- knows the difference. It is minted the only way the admin API
 * allows without a password: a magic link generated server-side and spent
 * server-side, in the same request, with the token never leaving this
 * process.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';

/** The identity nixamp vouched for. */
export interface NixampIdentity {
  email: string;
  handle?: string;
  sub: string;
}

export interface MintedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** True when the account here was made by this sign-in. */
  created: boolean;
}

export class NixampSignInError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'NixampSignInError';
  }
}

/**
 * Where to land afterwards: a path on this site, never another origin.
 *
 * `//evil.example` and `/\evil.example` are both origins to a browser, so
 * anything that does not start with exactly one slash and a path character
 * becomes the fallback.
 */
export function safeRedirect(value: string | null | undefined, fallback = '/settings?tab=connections'): string {
  if (!value || !/^\/(?![/\\])/.test(value)) return fallback;
  return value;
}

function sb(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

/**
 * The account for a nixamp identity, and a session for it.
 *
 * Existing account: the one with that email, which is why `email` is a scope
 * this sign-in cannot do without. New account: made confirmed, because nixamp
 * already confirmed the address, with the handle as its display name so the
 * party shows the same name on both sides.
 */
export async function sessionForNixampIdentity(
  who: NixampIdentity,
  client: SupabaseClient = sb()
): Promise<MintedSession> {
  const email = who.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new NixampSignInError('nixamp did not say which email address this account has', 'no_email');
  }

  let created = false;
  const made = await client.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      ...(who.handle ? { display_name: who.handle, nixamp_handle: who.handle } : {}),
      nixamp_sub: who.sub,
      signed_up_with: 'nixamp',
    },
  });
  if (!made.error) {
    created = true;
  } else if (!/already|exists|registered/i.test(made.error.message)) {
    throw new NixampSignInError(`could not make an account here: ${made.error.message}`, 'create_failed');
  }

  // A magic link, generated and spent here. The hashed token is what the
  // link would have carried; verifying it is what clicking it would do.
  const link = await client.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) {
    throw new NixampSignInError(`could not sign that account in: ${link.error?.message ?? 'no token'}`, 'link_failed');
  }
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session || !verified.data.user) {
    throw new NixampSignInError(`could not sign that account in: ${verified.error?.message ?? 'no session'}`, 'verify_failed');
  }

  return {
    userId: verified.data.user.id,
    accessToken: verified.data.session.access_token,
    refreshToken: verified.data.session.refresh_token,
    created,
  };
}

/** The same cookie a password login sets, so nothing downstream can tell. */
export const AUTH_COOKIE_NAME = 'sb-auth-token';
export const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function sessionCookieValue(session: Pick<MintedSession, 'accessToken' | 'refreshToken'>): string {
  return encodeURIComponent(JSON.stringify({ access_token: session.accessToken, refresh_token: session.refreshToken }));
}
