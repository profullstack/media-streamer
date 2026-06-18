/**
 * Finance — server-side watchlist (list) data access.
 *
 * Kept out of the pure `watchlist.ts` (and any client bundle) because it pulls
 * the Supabase server client. All queries are scoped to the active profile so a
 * caller can only touch its own lists.
 */

import { getServerClient } from '@/lib/supabase';
import { DEFAULT_WATCHLIST_NAME } from './watchlist';

export interface WatchlistSummary {
  id: string;
  name: string;
  createdAt: string;
  count: number;
}

interface ListRow {
  id: string;
  name: string;
  created_at: string;
  finance_watchlist?: Array<{ count: number }>;
}

/** All of a profile's lists (oldest first), each with its item count. */
export async function listWatchlists(profileId: string): Promise<WatchlistSummary[]> {
  const { data, error } = await getServerClient()
    .from('finance_watchlists')
    .select('id, name, created_at, finance_watchlist(count)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as ListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    count: row.finance_watchlist?.[0]?.count ?? 0,
  }));
}

/** Create a list owned by the profile and return its row. */
export async function createWatchlist(
  profileId: string,
  name: string,
): Promise<{ id: string; name: string; createdAt: string }> {
  const { data, error } = await getServerClient()
    .from('finance_watchlists')
    .insert({ profile_id: profileId, name })
    .select('id, name, created_at')
    .single();

  if (error) throw error;
  return { id: data.id, name: data.name, createdAt: data.created_at };
}

/**
 * Return the profile's default (oldest) list id, creating a "Watchlist" if the
 * profile has none yet. Used when a caller omits an explicit list id.
 */
export async function getOrCreateDefaultWatchlistId(profileId: string): Promise<string> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('finance_watchlists')
    .select('id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data.id;

  const created = await createWatchlist(profileId, DEFAULT_WATCHLIST_NAME);
  return created.id;
}

/** True when the list exists and belongs to the profile. */
export async function ownsWatchlist(profileId: string, watchlistId: string): Promise<boolean> {
  const { data, error } = await getServerClient()
    .from('finance_watchlists')
    .select('id')
    .eq('id', watchlistId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
