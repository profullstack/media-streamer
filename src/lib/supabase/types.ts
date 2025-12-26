/**
 * Supabase Database Types
 * These types are generated from the database schema
 * Run `pnpm dlx supabase gen types typescript` to regenerate after schema changes
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      torrents: {
        Row: {
          id: string;
          infohash: string;
          magnet_uri: string;
          name: string;
          total_size: number;
          file_count: number;
          piece_length: number | null;
          created_by: string | null;
          status: 'pending' | 'indexing' | 'ready' | 'error';
          error_message: string | null;
          indexed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          infohash: string;
          magnet_uri: string;
          name: string;
          total_size?: number;
          file_count?: number;
          piece_length?: number | null;
          created_by?: string | null;
          status?: 'pending' | 'indexing' | 'ready' | 'error';
          error_message?: string | null;
          indexed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          infohash?: string;
          magnet_uri?: string;
          name?: string;
          total_size?: number;
          file_count?: number;
          piece_length?: number | null;
          created_by?: string | null;
          status?: 'pending' | 'indexing' | 'ready' | 'error';
          error_message?: string | null;
          indexed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      torrent_files: {
        Row: {
          id: string;
          torrent_id: string;
          file_index: number;
          path: string;
          name: string;
          extension: string | null;
          size: number;
          piece_start: number;
          piece_end: number;
          media_category: 'audio' | 'video' | 'ebook' | 'document' | 'other' | null;
          mime_type: string | null;
          search_vector: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          torrent_id: string;
          file_index: number;
          path: string;
          name: string;
          extension?: string | null;
          size: number;
          piece_start: number;
          piece_end: number;
          media_category?: 'audio' | 'video' | 'ebook' | 'document' | 'other' | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          torrent_id?: string;
          file_index?: number;
          path?: string;
          name?: string;
          extension?: string | null;
          size?: number;
          piece_start?: number;
          piece_end?: number;
          media_category?: 'audio' | 'video' | 'ebook' | 'document' | 'other' | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'torrent_files_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'torrents';
            referencedColumns: ['id'];
          }
        ];
      };
      audio_metadata: {
        Row: {
          id: string;
          file_id: string;
          artist: string | null;
          album: string | null;
          title: string | null;
          track_number: number | null;
          duration_seconds: number | null;
          bitrate: number | null;
          sample_rate: number | null;
          genre: string | null;
          year: number | null;
          search_vector: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          artist?: string | null;
          album?: string | null;
          title?: string | null;
          track_number?: number | null;
          duration_seconds?: number | null;
          bitrate?: number | null;
          sample_rate?: number | null;
          genre?: string | null;
          year?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          artist?: string | null;
          album?: string | null;
          title?: string | null;
          track_number?: number | null;
          duration_seconds?: number | null;
          bitrate?: number | null;
          sample_rate?: number | null;
          genre?: string | null;
          year?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      video_metadata: {
        Row: {
          id: string;
          file_id: string;
          title: string | null;
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          codec: string | null;
          bitrate: number | null;
          framerate: number | null;
          search_vector: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          title?: string | null;
          duration_seconds?: number | null;
          width?: number | null;
          height?: number | null;
          codec?: string | null;
          bitrate?: number | null;
          framerate?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          title?: string | null;
          duration_seconds?: number | null;
          width?: number | null;
          height?: number | null;
          codec?: string | null;
          bitrate?: number | null;
          framerate?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'video_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      ebook_metadata: {
        Row: {
          id: string;
          file_id: string;
          title: string | null;
          author: string | null;
          publisher: string | null;
          isbn: string | null;
          language: string | null;
          page_count: number | null;
          year: number | null;
          search_vector: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          title?: string | null;
          author?: string | null;
          publisher?: string | null;
          isbn?: string | null;
          language?: string | null;
          page_count?: number | null;
          year?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          title?: string | null;
          author?: string | null;
          publisher?: string | null;
          isbn?: string | null;
          language?: string | null;
          page_count?: number | null;
          year?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ebook_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          file_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_favorites_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          collection_type: 'playlist' | 'watchlist' | 'reading_list' | 'mixed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          collection_type: 'playlist' | 'watchlist' | 'reading_list' | 'mixed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          collection_type?: 'playlist' | 'watchlist' | 'reading_list' | 'mixed';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collection_items: {
        Row: {
          id: string;
          collection_id: string;
          file_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          file_id: string;
          position: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          collection_id?: string;
          file_id?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'collection_items_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collection_items_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      reading_progress: {
        Row: {
          id: string;
          user_id: string;
          file_id: string;
          current_page: number;
          total_pages: number | null;
          percentage: number;
          last_read_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_id: string;
          current_page?: number;
          total_pages?: number | null;
          percentage?: number;
          last_read_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_id?: string;
          current_page?: number;
          total_pages?: number | null;
          percentage?: number;
          last_read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_progress_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      watch_progress: {
        Row: {
          id: string;
          user_id: string;
          file_id: string;
          current_time_seconds: number;
          duration_seconds: number | null;
          percentage: number;
          last_watched_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_id: string;
          current_time_seconds?: number;
          duration_seconds?: number | null;
          percentage?: number;
          last_watched_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_id?: string;
          current_time_seconds?: number;
          duration_seconds?: number | null;
          percentage?: number;
          last_watched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'watch_progress_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      rate_limits: {
        Row: {
          id: string;
          ip_address: string;
          action_type: string;
          window_start: string;
          request_count: number;
        };
        Insert: {
          id?: string;
          ip_address: string;
          action_type: string;
          window_start: string;
          request_count?: number;
        };
        Update: {
          id?: string;
          ip_address?: string;
          action_type?: string;
          window_start?: string;
          request_count?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_files: {
        Args: {
          search_query: string;
          media_type?: string | null;
          torrent_uuid?: string | null;
          result_limit?: number;
          result_offset?: number;
        };
        Returns: {
          file_id: string;
          file_name: string;
          file_path: string;
          file_size: number;
          file_media_category: string;
          file_index: number;
          torrent_id: string;
          torrent_name: string;
          torrent_infohash: string;
          rank: number;
        }[];
      };
      search_torrent_files: {
        Args: {
          search_query: string;
          p_media_type?: string | null;
          p_torrent_id?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          file_id: string;
          file_path: string;
          file_name: string;
          file_size: number;
          file_extension: string | null;
          file_media_type: string | null;
          file_mime_type: string | null;
          file_index: number;
          piece_start: number;
          piece_end: number;
          torrent_id: string;
          torrent_name: string;
          torrent_infohash: string;
          rank: number;
        }[];
      };
      search_torrents: {
        Args: {
          search_query: string;
          p_status?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          torrent_id: string;
          torrent_name: string;
          torrent_infohash: string;
          torrent_size: number;
          torrent_file_count: number;
          torrent_status: string;
          torrent_created_at: string;
          rank: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Helper types for easier access
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Specific table types
export type Torrent = Tables<'torrents'>;
export type TorrentInsert = InsertTables<'torrents'>;
export type TorrentUpdate = UpdateTables<'torrents'>;

export type TorrentFile = Tables<'torrent_files'>;
export type TorrentFileInsert = InsertTables<'torrent_files'>;
export type TorrentFileUpdate = UpdateTables<'torrent_files'>;

export type AudioMetadata = Tables<'audio_metadata'>;
export type AudioMetadataInsert = InsertTables<'audio_metadata'>;
export type AudioMetadataUpdate = UpdateTables<'audio_metadata'>;

export type VideoMetadata = Tables<'video_metadata'>;
export type VideoMetadataInsert = InsertTables<'video_metadata'>;
export type VideoMetadataUpdate = UpdateTables<'video_metadata'>;

export type EbookMetadata = Tables<'ebook_metadata'>;
export type EbookMetadataInsert = InsertTables<'ebook_metadata'>;
export type EbookMetadataUpdate = UpdateTables<'ebook_metadata'>;

export type UserFavorite = Tables<'user_favorites'>;
export type Collection = Tables<'collections'>;
export type CollectionItem = Tables<'collection_items'>;
export type ReadingProgress = Tables<'reading_progress'>;
export type WatchProgress = Tables<'watch_progress'>;
export type RateLimit = Tables<'rate_limits'>;

// Media category type
export type MediaCategory = 'audio' | 'video' | 'ebook' | 'document' | 'other';

// Collection type
export type CollectionType = 'playlist' | 'watchlist' | 'reading_list' | 'mixed';
