/**
 * The nixamp connection a bittorrented user holds, and keeping it alive.
 *
 * Server-side only: the service-role client, which bypasses RLS, is what the
 * OAuth callback writes the row with.
 *
 * The one thing worth reading carefully is `usableAccessToken`. nixamp rotates
 * refresh tokens, so refreshing is a write, not a read: the new refresh token
 * MUST replace the old one, and if it does not, the next refresh presents a
 * retired token and nixamp withdraws every token in the family -- which looks,
 * from here, like the connection spontaneously dying. The write therefore
 * happens before the new access token is handed to anybody.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { getNixampOAuthConfig, type NixampOAuthConfig } from './config';
import { computeExpiresAt, discover, refreshTokens, revokeToken, type NixampMetadata } from './oauth';

/** bt_nixamp_accounts is newer than the generated types, so the untyped client. */
function sb(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

export interface NixampAccount {
  id: string;
  userId: string;
  nixampSub: string;
  nixampSite: string;
  handle: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
}

interface Row {
  id: string;
  user_id: string;
  nixamp_sub: string;
  nixamp_site: string;
  handle: string | null;
  email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
  scopes: string[] | null;
}

function fromRow(row: Row): NixampAccount {
  return {
    id: row.id,
    userId: row.user_id,
    nixampSub: row.nixamp_sub,
    nixampSite: row.nixamp_site,
    handle: row.handle ?? '',
    email: row.email ?? '',
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? '',
    tokenExpiresAt: new Date(row.token_expires_at),
    scopes: row.scopes ?? [],
  };
}

export interface UpsertInput {
  userId: string;
  nixampSub: string;
  nixampSite: string;
  handle?: string;
  email?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}

/** Write the grant. Re-connecting the same nixamp account replaces its tokens. */
export async function upsertNixampAccount(input: UpsertInput): Promise<NixampAccount> {
  const { data, error } = await sb()
    .from('bt_nixamp_accounts')
    .upsert(
      {
        user_id: input.userId,
        nixamp_sub: input.nixampSub,
        nixamp_site: input.nixampSite,
        handle: input.handle ?? null,
        email: input.email ?? null,
        access_token: input.accessToken,
        refresh_token: input.refreshToken ?? null,
        token_expires_at: computeExpiresAt(input.expiresIn).toISOString(),
        scopes: input.scopes,
      },
      { onConflict: 'user_id,nixamp_sub' }
    )
    .select()
    .single();
  if (error) throw new Error(`Could not save the nixamp connection: ${error.message}`);
  return fromRow(data as Row);
}

/** The connection this person has, or null. */
export async function getNixampAccount(userId: string): Promise<NixampAccount | null> {
  const { data, error } = await sb()
    .from('bt_nixamp_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Forget it here, and hand the tokens back to nixamp so they stop working there too. */
export async function disconnectNixampAccount(userId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const account = await getNixampAccount(userId);
  if (!account) return false;
  try {
    const config = { ...getNixampOAuthConfig(), site: account.nixampSite };
    const metadata = await discover(config, fetcher);
    // The refresh token first: revoking it takes the whole family with it,
    // which is the point. The access token is belt and braces for a grant
    // that never had a refresh token to revoke.
    if (account.refreshToken) await revokeToken(config, metadata, account.refreshToken, fetcher);
    else await revokeToken(config, metadata, account.accessToken, fetcher);
  } catch {
    // nixamp being unreachable must not leave a row here that the person
    // asked to be rid of. The token expires on its own within the hour.
  }
  const { error } = await sb().from('bt_nixamp_accounts').delete().eq('id', account.id);
  return !error;
}

export class NixampConnectionLost extends Error {
  constructor(message = 'the nixamp connection has ended; connect it again') {
    super(message);
    this.name = 'NixampConnectionLost';
  }
}

/**
 * An access token that is worth presenting, refreshing first if it is not.
 *
 * Answers the metadata too, because every caller that wants a token wants to
 * call something with it, and discovering twice is a round trip for nothing.
 */
export async function usableAccessToken(
  account: NixampAccount,
  fetcher: typeof fetch = fetch
): Promise<{ accessToken: string; config: NixampOAuthConfig; metadata: NixampMetadata }> {
  const config = { ...getNixampOAuthConfig(), site: account.nixampSite };
  const metadata = await discover(config, fetcher);
  if (account.tokenExpiresAt.getTime() > Date.now()) {
    return { accessToken: account.accessToken, config, metadata };
  }
  if (!account.refreshToken) throw new NixampConnectionLost('that nixamp connection cannot be renewed');

  let next;
  try {
    next = await refreshTokens(config, metadata, account.refreshToken, fetcher);
  } catch {
    // A refusal here is final rather than transient: nixamp rotates, so the
    // token we hold has either been used already or been withdrawn, and
    // trying it again is what turns a recoverable state into a lost family.
    await sb().from('bt_nixamp_accounts').delete().eq('id', account.id);
    throw new NixampConnectionLost();
  }

  // Written before it is used. If this process died between the exchange and
  // the write, the row would hold a retired refresh token and the next
  // refresh would withdraw everything.
  await sb()
    .from('bt_nixamp_accounts')
    .update({
      access_token: next.access_token,
      refresh_token: next.refresh_token ?? account.refreshToken,
      token_expires_at: computeExpiresAt(next.expires_in).toISOString(),
      ...(next.scope ? { scopes: next.scope.split(' ').filter(Boolean) } : {}),
    })
    .eq('id', account.id);

  account.accessToken = next.access_token;
  if (next.refresh_token) account.refreshToken = next.refresh_token;
  account.tokenExpiresAt = computeExpiresAt(next.expires_in);
  return { accessToken: next.access_token, config, metadata };
}
