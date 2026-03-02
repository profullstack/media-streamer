/**
 * Library Repository
 *
 * Server-side repository for user library operations:
 * - Favorites
 * - Collections
 * - Watch/Reading Progress (History)
 *
 * All Supabase calls are server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// Type aliases for database tables
type Tables = Database['public']['Tables'];
type UserFavoriteRow = Tables['user_favorites']['Row'];
type CollectionRow = Tables['collections']['Row'];
type CollectionItemRow = Tables['collection_items']['Row'];
type WatchProgressRow = Tables['watch_progress']['Row'];
type ReadingProgressRow = Tables['reading_progress']['Row'];
type TorrentFileRow = Tables['bt_torrent_files']['Row'];
type TorrentRow = Tables['bt_torrents']['Row'];

/**
 * Collection type options
 */
export type CollectionType = 'playlist' | 'watchlist' | 'reading_list' | 'mixed';

/**
 * Favorite with file details
 */
export interface Favorite extends UserFavoriteRow {
  bt_torrent_files?: TorrentFileRow & {
    bt_torrents?: TorrentRow;
  };
}

/**
 * Collection with item count
 */
export interface Collection extends CollectionRow {
  item_count?: number;
}

/**
 * Collection item with file details
 */
export interface CollectionItem extends CollectionItemRow {
  bt_torrent_files?: TorrentFileRow;
}

/**
 * Watch progress with file details
 */
export interface WatchProgress extends WatchProgressRow {
  bt_torrent_files?: TorrentFileRow;
}

/**
 * Reading progress with file details
 */
export interface ReadingProgress extends ReadingProgressRow {
  bt_torrent_files?: TorrentFileRow;
}

/**
 * Combined history item (watch or reading)
 */
export interface HistoryItem {
  id: string;
  type: 'watch' | 'reading';
  file_id: string;
  percentage: number;
  last_activity_at: string;
  file?: TorrentFileRow;
  // Watch-specific
  current_time_seconds?: number;
  duration_seconds?: number | null;
  // Reading-specific
  current_page?: number;
  total_pages?: number | null;
}

/**
 * Library Repository class
 *
 * Handles all library-related database operations
 */
export class LibraryRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  // ============================================
  // FAVORITES
  // ============================================

  /**
   * Get all favorites for a profile
   */
  async getUserFavorites(profileId: string): Promise<Favorite[]> {
    const { data, error } = await this.supabase
      .from('user_favorites')
      .select(
        `
        *,
        bt_torrent_files (
          *,
          bt_torrents (*)
        )
      `
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch favorites: ${error.message}`);
    }

    return (data ?? []) as Favorite[];
  }

  /**
   * Add a file to favorites
   */
  async addFavorite(profileId: string, fileId: string): Promise<Favorite> {
    const { data, error } = await this.supabase
      .from('user_favorites')
      .insert({
        profile_id: profileId,
        file_id: fileId,
      } as any)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('File already in favorites');
      }
      throw new Error(`Failed to add favorite: ${error.message}`);
    }

    return data as Favorite;
  }

  /**
   * Remove a file from favorites
   */
  async removeFavorite(profileId: string, fileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_favorites')
      .delete()
      .eq('profile_id', profileId)
      .eq('file_id', fileId);

    if (error) {
      throw new Error(`Failed to remove favorite: ${error.message}`);
    }
  }

  /**
   * Check if a file is favorited by a profile
   */
  async isFavorite(profileId: string, fileId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('user_favorites')
      .select('id')
      .eq('profile_id', profileId)
      .eq('file_id', fileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check favorite: ${error.message}`);
    }

    return data !== null;
  }

  // ============================================
  // COLLECTIONS
  // ============================================

  /**
   * Get all collections for a profile
   */
  async getUserCollections(profileId: string): Promise<Collection[]> {
    const { data, error } = await this.supabase
      .from('collections')
      .select(
        `
        *,
        collection_items (count)
      `
      )
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch collections: ${error.message}`);
    }

    // Transform to include item_count
    return (data ?? []).map((collection) => ({
      ...collection,
      item_count: Array.isArray(collection.collection_items)
        ? collection.collection_items[0]?.count ?? 0
        : 0,
    })) as Collection[];
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(
    profileId: string,
    collectionId: string
  ): Promise<Collection | null> {
    const { data, error } = await this.supabase
      .from('collections')
      .select(
        `
        *,
        collection_items (count)
      `
      )
      .eq('id', collectionId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch collection: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      ...data,
      item_count: Array.isArray(data.collection_items)
        ? data.collection_items[0]?.count ?? 0
        : 0,
    } as Collection;
  }

  /**
   * Create a new collection
   */
  async createCollection(
    profileId: string,
    name: string,
    collectionType: CollectionType
  ): Promise<Collection> {
    const { data, error } = await this.supabase
      .from('collections')
      .insert({
        profile_id: profileId,
        name,
        collection_type: collectionType,
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create collection: ${error.message}`);
    }

    return data as Collection;
  }

  /**
   * Update a collection
   */
  async updateCollection(
    profileId: string,
    collectionId: string,
    updates: { name?: string; collection_type?: CollectionType }
  ): Promise<Collection> {
    const { data, error } = await this.supabase
      .from('collections')
      .update(updates)
      .eq('id', collectionId)
      .eq('profile_id', profileId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update collection: ${error.message}`);
    }

    return data as Collection;
  }

  /**
   * Delete a collection
   */
  async deleteCollection(profileId: string, collectionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('collections')
      .delete()
      .eq('id', collectionId)
      .eq('profile_id', profileId);

    if (error) {
      throw new Error(`Failed to delete collection: ${error.message}`);
    }
  }

  /**
   * Get items in a collection
   */
  async getCollectionItems(collectionId: string): Promise<CollectionItem[]> {
    const { data, error } = await this.supabase
      .from('collection_items')
      .select(
        `
        *,
        bt_torrent_files (*)
      `
      )
      .eq('collection_id', collectionId)
      .order('position', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch collection items: ${error.message}`);
    }

    return (data ?? []) as CollectionItem[];
  }

  /**
   * Add a file to a collection
   */
  async addToCollection(
    collectionId: string,
    fileId: string,
    position: number
  ): Promise<CollectionItem> {
    const { data, error } = await this.supabase
      .from('collection_items')
      .insert({
        collection_id: collectionId,
        file_id: fileId,
        position,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('File already in collection');
      }
      throw new Error(`Failed to add to collection: ${error.message}`);
    }

    return data as CollectionItem;
  }

  /**
   * Remove a file from a collection
   */
  async removeFromCollection(
    collectionId: string,
    fileId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .eq('file_id', fileId);

    if (error) {
      throw new Error(`Failed to remove from collection: ${error.message}`);
    }
  }

  /**
   * Reorder items in a collection
   */
  async reorderCollectionItems(
    collectionId: string,
    itemPositions: { fileId: string; position: number }[]
  ): Promise<void> {
    // Update each item's position
    const updates = itemPositions.map(({ fileId, position }) =>
      this.supabase
        .from('collection_items')
        .update({ position })
        .eq('collection_id', collectionId)
        .eq('file_id', fileId)
    );

    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      throw new Error('Failed to reorder collection items');
    }
  }

  // ============================================
  // WATCH PROGRESS (VIDEO HISTORY)
  // ============================================

  /**
   * Get watch history for a profile
   */
  async getWatchHistory(profileId: string, limit = 50): Promise<WatchProgress[]> {
    const { data, error } = await this.supabase
      .from('watch_progress')
      .select(
        `
        *,
        bt_torrent_files (*)
      `
      )
      .eq('profile_id', profileId)
      .order('last_watched_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch watch history: ${error.message}`);
    }

    return (data ?? []) as WatchProgress[];
  }

  /**
   * Get watch progress for a specific file
   */
  async getWatchProgress(
    profileId: string,
    fileId: string
  ): Promise<WatchProgress | null> {
    const { data, error } = await this.supabase
      .from('watch_progress')
      .select('*')
      .eq('profile_id', profileId)
      .eq('file_id', fileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch watch progress: ${error.message}`);
    }

    return data as WatchProgress | null;
  }

  /**
   * Update watch progress for a file
   */
  async updateWatchProgress(
    profileId: string,
    fileId: string,
    currentTimeSeconds: number,
    durationSeconds: number
  ): Promise<WatchProgress> {
    const percentage =
      durationSeconds > 0
        ? Math.round((currentTimeSeconds / durationSeconds) * 100)
        : 0;

    const { data, error } = await this.supabase
      .from('watch_progress')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(
        {
          profile_id: profileId,
          file_id: fileId,
          current_time_seconds: currentTimeSeconds,
          duration_seconds: durationSeconds,
          percentage,
          last_watched_at: new Date().toISOString(),
        } as any,
        {
          onConflict: 'profile_id,file_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update watch progress: ${error.message}`);
    }

    return data as WatchProgress;
  }

  /**
   * Clear watch history for a profile
   */
  async clearWatchHistory(profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('watch_progress')
      .delete()
      .eq('profile_id', profileId);

    if (error) {
      throw new Error(`Failed to clear watch history: ${error.message}`);
    }
  }

  // ============================================
  // READING PROGRESS (EBOOK HISTORY)
  // ============================================

  /**
   * Get reading history for a profile
   */
  async getReadingHistory(
    profileId: string,
    limit = 50
  ): Promise<ReadingProgress[]> {
    const { data, error } = await this.supabase
      .from('reading_progress')
      .select(
        `
        *,
        bt_torrent_files (*)
      `
      )
      .eq('profile_id', profileId)
      .order('last_read_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch reading history: ${error.message}`);
    }

    return (data ?? []) as ReadingProgress[];
  }

  /**
   * Get reading progress for a specific file
   */
  async getReadingProgress(
    profileId: string,
    fileId: string
  ): Promise<ReadingProgress | null> {
    const { data, error } = await this.supabase
      .from('reading_progress')
      .select('*')
      .eq('profile_id', profileId)
      .eq('file_id', fileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch reading progress: ${error.message}`);
    }

    return data as ReadingProgress | null;
  }

  /**
   * Update reading progress for a file
   */
  async updateReadingProgress(
    profileId: string,
    fileId: string,
    currentPage: number,
    totalPages: number
  ): Promise<ReadingProgress> {
    const percentage =
      totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

    const { data, error } = await this.supabase
      .from('reading_progress')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(
        {
          profile_id: profileId,
          file_id: fileId,
          current_page: currentPage,
          total_pages: totalPages,
          percentage,
          last_read_at: new Date().toISOString(),
        } as any,
        {
          onConflict: 'profile_id,file_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update reading progress: ${error.message}`);
    }

    return data as ReadingProgress;
  }

  /**
   * Clear reading history for a profile
   */
  async clearReadingHistory(profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reading_progress')
      .delete()
      .eq('profile_id', profileId);

    if (error) {
      throw new Error(`Failed to clear reading history: ${error.message}`);
    }
  }

  // ============================================
  // COMBINED HISTORY
  // ============================================

  /**
   * Get combined watch and reading history
   */
  async getCombinedHistory(profileId: string, limit = 50): Promise<HistoryItem[]> {
    // Fetch both histories in parallel
    const [watchHistory, readingHistory] = await Promise.all([
      this.getWatchHistory(profileId, limit),
      this.getReadingHistory(profileId, limit),
    ]);

    // Transform to unified format
    const watchItems: HistoryItem[] = watchHistory.map((item) => ({
      id: item.id,
      type: 'watch' as const,
      file_id: item.file_id,
      percentage: Number(item.percentage) || 0,
      last_activity_at: item.last_watched_at ?? new Date().toISOString(),
      file: item.bt_torrent_files,
      current_time_seconds: item.current_time_seconds ?? undefined,
      duration_seconds: item.duration_seconds,
    }));

    const readingItems: HistoryItem[] = readingHistory.map((item) => ({
      id: item.id,
      type: 'reading' as const,
      file_id: item.file_id,
      percentage: Number(item.percentage) || 0,
      last_activity_at: item.last_read_at ?? new Date().toISOString(),
      file: item.bt_torrent_files,
      current_page: item.current_page ?? undefined,
      total_pages: item.total_pages,
    }));

    // Combine and sort by last activity
    const combined = [...watchItems, ...readingItems].sort(
      (a, b) =>
        new Date(b.last_activity_at).getTime() -
        new Date(a.last_activity_at).getTime()
    );

    return combined.slice(0, limit);
  }

  /**
   * Clear all history for a profile
   */
  async clearAllHistory(profileId: string): Promise<void> {
    await Promise.all([
      this.clearWatchHistory(profileId),
      this.clearReadingHistory(profileId),
    ]);
  }
}

// ============================================
// SINGLETON FACTORY
// ============================================

import { getServerClient } from '../supabase/client';

let libraryRepository: LibraryRepository | null = null;

/**
 * Get the library repository singleton
 */
export function getLibraryRepository(): LibraryRepository {
  if (!libraryRepository) {
    libraryRepository = new LibraryRepository(getServerClient());
  }
  return libraryRepository;
}

/**
 * Create a library repository with a custom client (for testing)
 */
export function createLibraryRepository(
  client: SupabaseClient<Database>
): LibraryRepository {
  return new LibraryRepository(client);
}
