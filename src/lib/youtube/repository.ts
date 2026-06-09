/**
 * Repository for bt_youtube_accounts.
 *
 * Uses the service-role Supabase client and bypasses RLS.
 * All functions take an explicit userId and scope queries by it.
 */

import { createServerClient } from '@/lib/supabase';
import { hasYouTubeCommentWriteScope, hasYouTubeSearchScope, hasYouTubeSubscriptionManageScope } from './config';
import type { PublicYouTubeAccount, YouTubeAccount } from './types';

const TABLE = 'bt_youtube_accounts';

interface DbRow {
  id: string;
  user_id: string;
  google_sub: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  scopes: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function rowToAccount(row: DbRow): YouTubeAccount {
  return {
    id: row.id,
    userId: row.user_id,
    googleSub: row.google_sub,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicAccount(a: YouTubeAccount): PublicYouTubeAccount {
  return {
    id: a.id,
    email: a.email,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    isDefault: a.isDefault,
    hasSearchAccess: hasYouTubeSearchScope(a.scopes),
    hasSubscriptionManageAccess: hasYouTubeSubscriptionManageScope(a.scopes),
    hasCommentWriteAccess: hasYouTubeCommentWriteScope(a.scopes),
    createdAt: a.createdAt,
  };
}

export interface UpsertAccountInput {
  userId: string;
  googleSub: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  scopes: string[];
}

/**
 * Insert or update an account for (userId, googleSub).
 * If this is the user's first account it is made default.
 * Preserves existing refresh_token if Google doesn't send a new one (caller decides).
 */
export async function upsertAccount(input: UpsertAccountInput): Promise<YouTubeAccount> {
  const supabase = createServerClient();

  // Check whether the user already has any account.
  const { count, error: countError } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId);

  if (countError) {
    throw new Error(`Failed to count youtube accounts: ${countError.message}`);
  }

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: input.userId,
        google_sub: input.googleSub,
        email: input.email,
        display_name: input.displayName,
        avatar_url: input.avatarUrl,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        token_expires_at: input.tokenExpiresAt,
        scopes: input.scopes,
        is_default: isFirst ? true : undefined,
      },
      { onConflict: 'user_id,google_sub' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert youtube account: ${error?.message ?? 'no data'}`);
  }

  return rowToAccount(data as DbRow);
}

export async function listAccountsForUser(userId: string): Promise<YouTubeAccount[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list youtube accounts: ${error.message}`);
  }

  return (data as DbRow[]).map(rowToAccount);
}

export async function getAccountById(userId: string, accountId: string): Promise<YouTubeAccount | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get youtube account: ${error.message}`);
  }
  return data ? rowToAccount(data as DbRow) : null;
}

export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  const supabase = createServerClient();

  // Was it the default? If so, promote the oldest remaining to default.
  const target = await getAccountById(userId, accountId);
  if (!target) return;

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', accountId);

  if (error) {
    throw new Error(`Failed to delete youtube account: ${error.message}`);
  }

  if (target.isDefault) {
    const remaining = await listAccountsForUser(userId);
    if (remaining.length > 0) {
      await setDefaultAccount(userId, remaining[0].id);
    }
  }
}

/**
 * Set a given account as default. Clears the default flag on all other
 * accounts owned by the same user first (required because of the partial
 * unique index).
 */
export async function setDefaultAccount(userId: string, accountId: string): Promise<void> {
  const supabase = createServerClient();

  const { error: clearError } = await supabase
    .from(TABLE)
    .update({ is_default: false })
    .eq('user_id', userId)
    .neq('id', accountId);

  if (clearError) {
    throw new Error(`Failed to clear default youtube accounts: ${clearError.message}`);
  }

  const { error: setError } = await supabase
    .from(TABLE)
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('id', accountId);

  if (setError) {
    throw new Error(`Failed to set default youtube account: ${setError.message}`);
  }
}
