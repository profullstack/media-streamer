/**
 * Per-user Spotify credentials repository.
 *
 * Stores the `credentials.json` librespot writes after device pairing. It is
 * a reusable login for the user's whole account, so it is sealed under the
 * user's key vault (only their passphrase opens it; while they are locked the
 * player cannot start). Uses the service-role client and scopes by userId.
 */

import { createServerClient } from '@/lib/supabase';
import { FIELDS, openValue, sealValue } from '@/lib/vault';

const TABLE = 'bt_spotify_sessions';

export interface SpotifyCredentials {
  userId: string;
  username: string | null;
  credentialsJson: string;
  updatedAt: string;
}

export interface SaveSpotifyCredentialsInput {
  userId: string;
  credentialsJson: string;
}

interface DbRow {
  user_id: string;
  username: string | null;
  credentials_enc: string;
  updated_at: string;
}

const COLUMNS = 'user_id, username, credentials_enc, updated_at';

async function rowToCredentials(row: DbRow): Promise<SpotifyCredentials> {
  return {
    userId: row.user_id,
    username: row.username,
    credentialsJson: await openValue(row.user_id, FIELDS.spotifyCredentials, row.credentials_enc),
    updatedAt: row.updated_at,
  };
}

/** The display name inside librespot's credentials file, if present. */
export function usernameFromCredentials(credentialsJson: string): string | null {
  try {
    const parsed = JSON.parse(credentialsJson) as { username?: unknown };
    return typeof parsed.username === 'string' && parsed.username ? parsed.username : null;
  } catch {
    return null;
  }
}

export async function getSpotifyCredentials(userId: string): Promise<SpotifyCredentials | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`getSpotifyCredentials: ${error.message}`);
  if (!data) return null;
  return rowToCredentials(data as DbRow);
}

export async function saveSpotifyCredentials(
  input: SaveSpotifyCredentialsInput
): Promise<SpotifyCredentials> {
  const supabase = createServerClient();
  const payload = {
    user_id: input.userId,
    username: usernameFromCredentials(input.credentialsJson),
    credentials_enc: await sealValue(input.userId, FIELDS.spotifyCredentials, input.credentialsJson),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`saveSpotifyCredentials: ${error.message}`);
  return rowToCredentials(data as DbRow);
}

export async function deleteSpotifyCredentials(userId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(`deleteSpotifyCredentials: ${error.message}`);
}
