/**
 * Sign in with nixamp.
 *
 * nixamp.com is the authorization server and, for somebody who arrives from
 * it -- a party link in the nixamp app, a terminal, a television -- it is
 * also who they are. But only for an account here that has CONNECTED that
 * nixamp account (Settings > Connections, while signed in): the binding row
 * in bt_nixamp_accounts, keyed by nixamp's `sub`, is the whole identity.
 *
 * The address nixamp reports is never used to find an account here. nixamp
 * has never proved it (sign-up there is a password with no mail step, and a
 * CoinPay sign-in there carries no proven address either), so matching on it
 * would hand anybody's account here to whoever typed their address into
 * nixamp. Nor is an account made on the spot: sign-up here is invite-only.
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
  sub: string;
  /** The nixamp site that issued `sub`; a subject is only unique there. */
  site: string;
}

export interface MintedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
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
 * The account connected to this nixamp identity, and a session for it.
 *
 * Exactly one account here must have connected this nixamp `sub`; none (or,
 * defensively, more than one) is a refusal that tells the person to sign in
 * the usual way and connect nixamp from settings.
 */
export async function sessionForNixampIdentity(
  who: NixampIdentity,
  client: SupabaseClient = sb()
): Promise<MintedSession> {
  if (!who.sub) {
    throw new NixampSignInError('nixamp did not say which account this is', 'no_sub');
  }

  const bound = await client
    .from('bt_nixamp_accounts')
    .select('user_id')
    .eq('nixamp_sub', who.sub)
    .eq('nixamp_site', who.site);
  if (bound.error) {
    throw new NixampSignInError(`could not look up the nixamp connection: ${bound.error.message}`, 'lookup_failed');
  }
  const owners = [...new Set(((bound.data ?? []) as { user_id: string }[]).map((row) => row.user_id))];
  if (owners.length !== 1) {
    throw new NixampSignInError(
      owners.length === 0 ? 'no account here has connected that nixamp account' : 'that nixamp account is connected to more than one account here',
      'not_connected'
    );
  }
  const userId = owners[0]!;

  const found = await client.auth.admin.getUserById(userId);
  const email = found.data?.user?.email;
  if (found.error || !email) {
    throw new NixampSignInError(`could not find the connected account: ${found.error?.message ?? 'no email'}`, 'not_connected');
  }

  // A magic link for the CONNECTED account's own address, generated and spent
  // here. The hashed token is what the link would have carried; verifying it
  // is what clicking it would do.
  const link = await client.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) {
    throw new NixampSignInError(`could not sign that account in: ${link.error?.message ?? 'no token'}`, 'link_failed');
  }
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session || !verified.data.user) {
    throw new NixampSignInError(`could not sign that account in: ${verified.error?.message ?? 'no session'}`, 'verify_failed');
  }
  if (verified.data.user.id !== userId) {
    throw new NixampSignInError('the session minted is not the connected account', 'verify_failed');
  }

  return {
    userId,
    accessToken: verified.data.session.access_token,
    refreshToken: verified.data.session.refresh_token,
  };
}

/** The same cookie a password login sets, so nothing downstream can tell. */
export const AUTH_COOKIE_NAME = 'sb-auth-token';
export const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function sessionCookieValue(session: Pick<MintedSession, 'accessToken' | 'refreshToken'>): string {
  return encodeURIComponent(JSON.stringify({ access_token: session.accessToken, refresh_token: session.refreshToken }));
}
