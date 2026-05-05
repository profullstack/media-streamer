/**
 * Per-user SiriusXM credentials repository.
 *
 * Stores the AUTH_TOKEN.session.accessToken and the cookie jar so the server
 * can refresh sessions on the user's behalf. Uses the service-role client and
 * scopes by userId — RLS still protects browser-side access.
 */

import { createServerClient } from '@/lib/supabase';

const TABLE = 'bt_siriusxm_sessions';

export interface SiriusXmCredentials {
  userId: string;
  email: string | null;
  accessToken: string;
  sessionCookies: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  updatedAt: string;
}

export interface SaveCredentialsInput {
  userId: string;
  email?: string | null;
  accessToken: string;
  sessionCookies: string;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
}

interface DbRow {
  user_id: string;
  email: string | null;
  access_token: string;
  session_cookies: string;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  updated_at: string;
}

function rowToCredentials(row: DbRow): SiriusXmCredentials {
  return {
    userId: row.user_id,
    email: row.email,
    accessToken: row.access_token,
    sessionCookies: row.session_cookies,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    updatedAt: row.updated_at,
  };
}

export async function getCredentials(userId: string): Promise<SiriusXmCredentials | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, email, access_token, session_cookies, access_token_expires_at, refresh_token_expires_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`getCredentials: ${error.message}`);
  if (!data) return null;
  return rowToCredentials(data as DbRow);
}

export async function saveCredentials(
  input: SaveCredentialsInput
): Promise<SiriusXmCredentials> {
  const supabase = createServerClient();
  const payload = {
    user_id: input.userId,
    email: input.email ?? null,
    access_token: input.accessToken,
    session_cookies: input.sessionCookies,
    access_token_expires_at: input.accessTokenExpiresAt ?? null,
    refresh_token_expires_at: input.refreshTokenExpiresAt ?? null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, email, access_token, session_cookies, access_token_expires_at, refresh_token_expires_at, updated_at')
    .single();

  if (error) throw new Error(`saveCredentials: ${error.message}`);
  return rowToCredentials(data as DbRow);
}

export async function deleteCredentials(userId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(`deleteCredentials: ${error.message}`);
}

/**
 * List every stored session. Used by the periodic refresh scheduler.
 * Skips rows with empty session_cookies (nothing to replay against /refresh).
 */
export async function listAllCredentials(): Promise<SiriusXmCredentials[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, email, access_token, session_cookies, access_token_expires_at, refresh_token_expires_at, updated_at')
    .neq('session_cookies', '');

  if (error) throw new Error(`listAllCredentials: ${error.message}`);
  return (data as DbRow[] | null)?.map(rowToCredentials) ?? [];
}
