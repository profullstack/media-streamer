/**
 * Favorites Service
 *
 * Server-side service for managing user favorites:
 * - Torrent favorites
 * - IPTV channel favorites
 *
 * All Supabase calls are server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  TorrentFavorite,
  IptvChannelFavorite,
} from '../supabase/types';

// Type aliases for database tables
type Tables = Database['public']['Tables'];
type TorrentFavoriteRow = Tables['bt_torrent_favorites']['Row'];
type IptvChannelFavoriteRow = Tables['iptv_channel_favorites']['Row'];
type TorrentRow = Tables['bt_torrents']['Row'];
type IptvPlaylistRow = Tables['iptv_playlists']['Row'];

/**
 * Torrent favorite with torrent details
 */
export interface TorrentFavoriteWithDetails extends TorrentFavoriteRow {
  bt_torrents?: Partial<TorrentRow>;
}

/**
 * IPTV channel favorite with playlist details
 */
export interface IptvChannelFavoriteWithDetails extends IptvChannelFavoriteRow {
  iptv_playlists?: Partial<IptvPlaylistRow>;
}

/**
 * Input for adding an IPTV channel favorite
 */
export interface AddIptvChannelFavoriteInput {
  playlistId: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  channelLogo?: string;
  channelGroup?: string;
  tvgId?: string;
  tvgName?: string;
}

/**
 * Combined favorites response
 */
export interface AllFavorites {
  torrentFavorites: TorrentFavoriteWithDetails[];
  iptvChannelFavorites: IptvChannelFavoriteWithDetails[];
}

/**
 * Favorites Service class
 *
 * Handles all favorites-related database operations
 */
export class FavoritesService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  // ============================================
  // TORRENT FAVORITES
  // ============================================

  /**
   * Get all torrent favorites for a user
   */
  async getTorrentFavorites(profileId: string): Promise<TorrentFavoriteWithDetails[]> {
    const { data, error } = await this.supabase
      .from('bt_torrent_favorites')
      .select(
        `
        *,
        bt_torrents (
          id,
          name,
          infohash,
          total_size,
          file_count,
          poster_url,
          cover_url,
          content_type,
          year,
          description,
          seeders,
          leechers,
          created_at
        )
      `
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch torrent favorites: ${error.message}`);
    }

    return (data ?? []) as TorrentFavoriteWithDetails[];
  }

  /**
   * Add a torrent to favorites
   */
  async addTorrentFavorite(profileId: string, torrentId: string): Promise<TorrentFavorite> {
    const { data, error } = await this.supabase
      .from('bt_torrent_favorites')
      .insert({
        profile_id: profileId,
        torrent_id: torrentId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Torrent already in favorites');
      }
      throw new Error(`Failed to add torrent favorite: ${error.message}`);
    }

    return data as TorrentFavorite;
  }

  /**
   * Remove a torrent from favorites
   */
  async removeTorrentFavorite(profileId: string, torrentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bt_torrent_favorites')
      .delete()
      .eq('profile_id', profileId)
      .eq('torrent_id', torrentId);

    if (error) {
      throw new Error(`Failed to remove torrent favorite: ${error.message}`);
    }
  }

  /**
   * Check if a torrent is favorited by a user
   */
  async isTorrentFavorite(profileId: string, torrentId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bt_torrent_favorites')
      .select('id')
      .eq('profile_id', profileId)
      .eq('torrent_id', torrentId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check torrent favorite: ${error.message}`);
    }

    return data !== null;
  }

  /**
   * Get the total favorites count for a torrent
   */
  async getTorrentFavoritesCount(torrentId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('bt_torrent_favorites')
      .select('*', { count: 'exact', head: true })
      .eq('torrent_id', torrentId);

    if (error) {
      throw new Error(`Failed to get torrent favorites count: ${error.message}`);
    }

    return count ?? 0;
  }

  // ============================================
  // IPTV CHANNEL FAVORITES
  // ============================================

  /**
   * Get all IPTV channel favorites for a user
   */
  async getIptvChannelFavorites(profileId: string): Promise<IptvChannelFavoriteWithDetails[]> {
    const { data, error } = await this.supabase
      .from('iptv_channel_favorites')
      .select(
        `
        *,
        iptv_playlists (
          id,
          name,
          m3u_url,
          epg_url
        )
      `
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch IPTV channel favorites: ${error.message}`);
    }

    return (data ?? []) as IptvChannelFavoriteWithDetails[];
  }

  /**
   * Get IPTV channel favorites for a specific playlist
   */
  async getIptvChannelFavoritesByPlaylist(
    profileId: string,
    playlistId: string
  ): Promise<IptvChannelFavorite[]> {
    const { data, error } = await this.supabase
      .from('iptv_channel_favorites')
      .select('*')
      .eq('profile_id', profileId)
      .eq('playlist_id', playlistId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch IPTV channel favorites: ${error.message}`);
    }

    return (data ?? []) as IptvChannelFavorite[];
  }

  /**
   * Add an IPTV channel to favorites
   */
  async addIptvChannelFavorite(
    profileId: string,
    input: AddIptvChannelFavoriteInput
  ): Promise<IptvChannelFavorite> {
    const { data, error } = await this.supabase
      .from('iptv_channel_favorites')
      .insert({
        profile_id: profileId,
        playlist_id: input.playlistId,
        channel_id: input.channelId,
        channel_name: input.channelName,
        channel_url: input.channelUrl,
        channel_logo: input.channelLogo,
        channel_group: input.channelGroup,
        tvg_id: input.tvgId,
        tvg_name: input.tvgName,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Channel already in favorites');
      }
      throw new Error(`Failed to add IPTV channel favorite: ${error.message}`);
    }

    return data as IptvChannelFavorite;
  }

  /**
   * Remove an IPTV channel from favorites
   */
  async removeIptvChannelFavorite(
    profileId: string,
    playlistId: string,
    channelId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('iptv_channel_favorites')
      .delete()
      .eq('profile_id', profileId)
      .eq('playlist_id', playlistId)
      .eq('channel_id', channelId);

    if (error) {
      throw new Error(`Failed to remove IPTV channel favorite: ${error.message}`);
    }
  }

  /**
   * Check if an IPTV channel is favorited by a user
   */
  async isIptvChannelFavorite(
    profileId: string,
    playlistId: string,
    channelId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('iptv_channel_favorites')
      .select('id')
      .eq('profile_id', profileId)
      .eq('playlist_id', playlistId)
      .eq('channel_id', channelId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check IPTV channel favorite: ${error.message}`);
    }

    return data !== null;
  }

  // ============================================
  // COMBINED FAVORITES
  // ============================================

  /**
   * Get all favorites for a user (torrents and IPTV channels)
   */
  async getAllFavorites(profileId: string): Promise<AllFavorites> {
    const [torrentFavorites, iptvChannelFavorites] = await Promise.all([
      this.getTorrentFavorites(profileId),
      this.getIptvChannelFavorites(profileId),
    ]);

    return {
      torrentFavorites,
      iptvChannelFavorites,
    };
  }
}

// ============================================
// SINGLETON FACTORY
// ============================================

import { getServerClient } from '../supabase/client';

let favoritesService: FavoritesService | null = null;

/**
 * Get the favorites service singleton
 */
export function getFavoritesService(): FavoritesService {
  if (!favoritesService) {
    favoritesService = new FavoritesService(getServerClient());
  }
  return favoritesService;
}

/**
 * Create a favorites service with a custom client (for testing)
 */
export function createFavoritesService(
  client: SupabaseClient<Database>
): FavoritesService {
  return new FavoritesService(client);
}
