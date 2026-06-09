/**
 * Authenticated YouTube Data API v3 client.
 *
 * Given a stored `YouTubeAccount`, this wrapper:
 *   1. Refreshes the access token when it's expired (or close to expiring)
 *   2. Persists the refreshed token back to bt_youtube_accounts
 *   3. Issues GET requests to `youtube/v3/*` endpoints with Bearer auth
 *
 * Kept deliberately small — each high-level endpoint (search, videos, etc.)
 * lives in `service.ts` and uses `ytFetch` from here.
 */

import { createServerClient } from '@/lib/supabase';
import { getGoogleOAuthConfig } from './config';
import { refreshAccessToken, computeExpiresAt } from './oauth';
import type { YouTubeAccount } from './types';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const TABLE = 'bt_youtube_accounts';

/** Refresh tokens that expire within this many seconds, to avoid mid-request expiry. */
const REFRESH_LEEWAY_SECONDS = 60;

function isExpired(account: YouTubeAccount, now: Date = new Date()): boolean {
  const expiresAtMs = new Date(account.tokenExpiresAt).getTime();
  return expiresAtMs - now.getTime() < REFRESH_LEEWAY_SECONDS * 1000;
}

/**
 * Ensure the account has a fresh access token, refreshing if needed.
 * Returns the (possibly updated) account.
 */
export async function ensureFreshAccessToken(account: YouTubeAccount): Promise<YouTubeAccount> {
  if (!isExpired(account)) return account;

  const config = getGoogleOAuthConfig();
  const tokens = await refreshAccessToken(config, account.refreshToken);

  const newExpiresAt = computeExpiresAt(tokens.expires_in);
  const newAccessToken = tokens.access_token;
  // Google typically does NOT return a new refresh_token on refresh; keep the old one.
  const newRefreshToken = tokens.refresh_token ?? account.refreshToken;

  const supabase = createServerClient();
  const { error } = await supabase
    .from(TABLE)
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_expires_at: newExpiresAt,
    })
    .eq('id', account.id);

  if (error) {
    throw new Error(`Failed to persist refreshed token: ${error.message}`);
  }

  return {
    ...account,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    tokenExpiresAt: newExpiresAt,
  };
}

export interface YtFetchOptions {
  /** Path relative to the YouTube v3 base, e.g. "/search". */
  path: string;
  /** Query parameters. Arrays are joined with commas (YouTube's convention). */
  params?: Record<string, string | number | string[] | undefined>;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

/**
 * Fetch a YouTube Data API v3 endpoint on behalf of the given account.
 * Automatically refreshes the access token if expired.
 */
export async function ytFetch<T>(
  account: YouTubeAccount,
  options: YtFetchOptions
): Promise<T> {
  const fresh = await ensureFreshAccessToken(account);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value === undefined) continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const url = `${YT_API_BASE}${options.path}?${search.toString()}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${fresh.accessToken}` };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${options.path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
