/**
 * Watchlist Repository
 *
 * Server-side repository for user watchlist operations.
 * Manages TMDB movie/TV show watchlists stored in Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

type Tables = Database['public']['Tables'];
type WatchlistRow = Tables['user_watchlists']['Row'];
type WatchlistItemRow = Tables['watchlist_items']['Row'];

export interface Watchlist extends WatchlistRow {
  item_count?: number;
}

export type WatchlistItemWithMeta = WatchlistItemRow;

export interface AddWatchlistItemInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  genres?: string[] | null;
  castNames?: string[] | null;
  directors?: string[] | null;
}

export class WatchlistRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * Get all watchlists for a user with item counts
   */
  async getUserWatchlists(userId: string): Promise<Watchlist[]> {
    const { data, error } = await this.supabase
      .from('user_watchlists')
      .select(`
        *,
        watchlist_items (count)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch watchlists: ${error.message}`);
    }

    return (data ?? []).map((wl) => ({
      ...wl,
      item_count: Array.isArray(wl.watchlist_items)
        ? wl.watchlist_items[0]?.count ?? 0
        : 0,
    })) as Watchlist[];
  }

  /**
   * Get or create default watchlist for a user
   */
  async getOrCreateDefaultWatchlist(userId: string): Promise<Watchlist> {
    // Check for existing watchlists
    const existing = await this.getUserWatchlists(userId);
    if (existing.length > 0) {
      return existing[0];
    }

    // Create default
    return this.createWatchlist(userId, 'My Watchlist');
  }

  /**
   * Create a new watchlist
   */
  async createWatchlist(userId: string, name: string): Promise<Watchlist> {
    const { data, error } = await this.supabase
      .from('user_watchlists')
      .insert({
        user_id: userId,
        name,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create watchlist: ${error.message}`);
    }

    return { ...data, item_count: 0 } as Watchlist;
  }

  /**
   * Rename a watchlist
   */
  async renameWatchlist(userId: string, watchlistId: string, name: string): Promise<Watchlist> {
    const { data, error } = await this.supabase
      .from('user_watchlists')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', watchlistId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to rename watchlist: ${error.message}`);
    }

    return data as Watchlist;
  }

  /**
   * Delete a watchlist
   */
  async deleteWatchlist(userId: string, watchlistId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_watchlists')
      .delete()
      .eq('id', watchlistId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete watchlist: ${error.message}`);
    }
  }

  /**
   * Get items in a watchlist
   */
  async getWatchlistItems(watchlistId: string): Promise<WatchlistItemWithMeta[]> {
    const { data, error } = await this.supabase
      .from('watchlist_items')
      .select('*')
      .eq('watchlist_id', watchlistId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch watchlist items: ${error.message}`);
    }

    return (data ?? []) as WatchlistItemWithMeta[];
  }

  /**
   * Add an item to a watchlist
   */
  async addItem(watchlistId: string, input: AddWatchlistItemInput): Promise<WatchlistItemWithMeta> {
    // Get current max position
    const { data: existing } = await this.supabase
      .from('watchlist_items')
      .select('position')
      .eq('watchlist_id', watchlistId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

    const { data, error } = await this.supabase
      .from('watchlist_items')
      .insert({
        watchlist_id: watchlistId,
        tmdb_id: input.tmdbId,
        media_type: input.mediaType,
        title: input.title,
        poster_path: input.posterPath ?? null,
        overview: input.overview ?? null,
        release_date: input.releaseDate ?? null,
        vote_average: input.voteAverage ?? null,
        genres: input.genres ?? null,
        cast_names: input.castNames ?? null,
        directors: input.directors ?? null,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Item already in watchlist');
      }
      throw new Error(`Failed to add item: ${error.message}`);
    }

    // Update watchlist timestamp
    await this.supabase
      .from('user_watchlists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', watchlistId);

    return data as WatchlistItemWithMeta;
  }

  /**
   * Remove an item from a watchlist
   */
  async removeItem(watchlistId: string, tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void> {
    const { error } = await this.supabase
      .from('watchlist_items')
      .delete()
      .eq('watchlist_id', watchlistId)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType);

    if (error) {
      throw new Error(`Failed to remove item: ${error.message}`);
    }
  }

  /**
   * Check which of the user's watchlists contain this item
   */
  async getWatchlistsContainingItem(
    userId: string,
    tmdbId: number,
    mediaType: 'movie' | 'tv',
  ): Promise<string[]> {
    const watchlists = await this.getUserWatchlists(userId);
    if (watchlists.length === 0) return [];

    const watchlistIds = watchlists.map(w => w.id);

    const { data, error } = await this.supabase
      .from('watchlist_items')
      .select('watchlist_id')
      .in('watchlist_id', watchlistIds)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType);

    if (error) {
      throw new Error(`Failed to check watchlists: ${error.message}`);
    }

    return (data ?? []).map(d => d.watchlist_id);
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

import { getServerClient } from '../supabase/client';

let watchlistRepository: WatchlistRepository | null = null;

export function getWatchlistRepository(): WatchlistRepository {
  if (!watchlistRepository) {
    watchlistRepository = new WatchlistRepository(getServerClient());
  }
  return watchlistRepository;
}

export function createWatchlistRepository(
  client: SupabaseClient<Database>
): WatchlistRepository {
  return new WatchlistRepository(client);
}
