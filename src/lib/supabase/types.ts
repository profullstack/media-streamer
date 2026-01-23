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
      bt_torrents: {
        Row: {
          id: string;
          infohash: string;
          magnet_uri: string;
          name: string;
          clean_title: string | null;
          total_size: number;
          file_count: number;
          piece_length: number | null;
          seeders: number | null;
          leechers: number | null;
          swarm_updated_at: string | null;
          created_by: string | null;
          status: 'pending' | 'indexing' | 'ready' | 'error';
          error_message: string | null;
          indexed_at: string | null;
          // External metadata fields
          poster_url: string | null;
          cover_url: string | null;
          content_type: 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other' | null;
          external_id: string | null;
          external_source: string | null;
          year: number | null;
          description: string | null;
          // Credits fields (from OMDb)
          director: string | null;
          actors: string[] | null;
          genre: string | null;
          metadata_fetched_at: string | null;
          // Codec fields (from representative file in collection)
          video_codec: string | null;
          audio_codec: string | null;
          container: string | null;
          needs_transcoding: boolean | null;
          codec_detected_at: string | null;
          // Vote counts (denormalized for performance)
          upvotes: number;
          downvotes: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          infohash: string;
          magnet_uri: string;
          name: string;
          clean_title?: string | null;
          total_size?: number;
          file_count?: number;
          piece_length?: number | null;
          seeders?: number | null;
          leechers?: number | null;
          swarm_updated_at?: string | null;
          created_by?: string | null;
          status?: 'pending' | 'indexing' | 'ready' | 'error';
          error_message?: string | null;
          indexed_at?: string | null;
          // External metadata fields
          poster_url?: string | null;
          cover_url?: string | null;
          content_type?: 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other' | null;
          external_id?: string | null;
          external_source?: string | null;
          year?: number | null;
          description?: string | null;
          // Credits fields (from OMDb)
          director?: string | null;
          actors?: string[] | null;
          genre?: string | null;
          metadata_fetched_at?: string | null;
          // Codec fields (from representative file in collection)
          video_codec?: string | null;
          audio_codec?: string | null;
          container?: string | null;
          needs_transcoding?: boolean;
          codec_detected_at?: string | null;
          // Vote counts (denormalized for performance)
          upvotes?: number;
          downvotes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          infohash?: string;
          magnet_uri?: string;
          name?: string;
          clean_title?: string | null;
          total_size?: number;
          file_count?: number;
          piece_length?: number | null;
          seeders?: number | null;
          leechers?: number | null;
          swarm_updated_at?: string | null;
          created_by?: string | null;
          status?: 'pending' | 'indexing' | 'ready' | 'error';
          error_message?: string | null;
          indexed_at?: string | null;
          // External metadata fields
          poster_url?: string | null;
          cover_url?: string | null;
          content_type?: 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other' | null;
          external_id?: string | null;
          external_source?: string | null;
          year?: number | null;
          description?: string | null;
          // Credits fields (from OMDb)
          director?: string | null;
          actors?: string[] | null;
          genre?: string | null;
          metadata_fetched_at?: string | null;
          // Codec fields (from representative file in collection)
          video_codec?: string | null;
          audio_codec?: string | null;
          container?: string | null;
          needs_transcoding?: boolean;
          codec_detected_at?: string | null;
          // Vote counts (denormalized for performance)
          upvotes?: number;
          downvotes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bt_torrent_folders: {
        Row: {
          id: string;
          torrent_id: string;
          path: string;
          artist: string | null;
          album: string | null;
          year: number | null;
          cover_url: string | null;
          external_id: string | null;
          external_source: string | null;
          metadata_fetched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          torrent_id: string;
          path: string;
          artist?: string | null;
          album?: string | null;
          year?: number | null;
          cover_url?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          metadata_fetched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          torrent_id?: string;
          path?: string;
          artist?: string | null;
          album?: string | null;
          year?: number | null;
          cover_url?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          metadata_fetched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_torrent_folders_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrents';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_torrent_files: {
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
            foreignKeyName: 'bt_torrent_files_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrents';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_audio_metadata: {
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
          codec: string | null;
          container: string | null;
          codec_detected_at: string | null;
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
          codec?: string | null;
          container?: string | null;
          codec_detected_at?: string | null;
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
          codec?: string | null;
          container?: string | null;
          codec_detected_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_audio_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'bt_torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_video_metadata: {
        Row: {
          id: string;
          file_id: string;
          title: string | null;
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          codec: string | null;
          audio_codec: string | null;
          container: string | null;
          bitrate: number | null;
          framerate: number | null;
          needs_transcoding: boolean;
          codec_detected_at: string | null;
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
          audio_codec?: string | null;
          container?: string | null;
          bitrate?: number | null;
          framerate?: number | null;
          needs_transcoding?: boolean;
          codec_detected_at?: string | null;
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
          audio_codec?: string | null;
          container?: string | null;
          bitrate?: number | null;
          framerate?: number | null;
          needs_transcoding?: boolean;
          codec_detected_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_video_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'bt_torrent_files';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_ebook_metadata: {
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
            foreignKeyName: 'bt_ebook_metadata_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: true;
            referencedRelation: 'bt_torrent_files';
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
            referencedRelation: 'bt_torrent_files';
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
            referencedRelation: 'bt_torrent_files';
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
            referencedRelation: 'bt_torrent_files';
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
            referencedRelation: 'bt_torrent_files';
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
      user_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          tier: 'trial' | 'premium' | 'family';
          status: 'active' | 'cancelled' | 'expired';
          trial_started_at: string | null;
          trial_expires_at: string | null;
          subscription_started_at: string | null;
          subscription_expires_at: string | null;
          renewal_reminder_sent_at: string | null;
          renewal_reminder_7d_sent: boolean;
          renewal_reminder_3d_sent: boolean;
          renewal_reminder_1d_sent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tier?: 'trial' | 'premium' | 'family';
          status?: 'active' | 'cancelled' | 'expired';
          trial_started_at?: string | null;
          trial_expires_at?: string | null;
          subscription_started_at?: string | null;
          subscription_expires_at?: string | null;
          renewal_reminder_sent_at?: string | null;
          renewal_reminder_7d_sent?: boolean;
          renewal_reminder_3d_sent?: boolean;
          renewal_reminder_1d_sent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tier?: 'trial' | 'premium' | 'family';
          status?: 'active' | 'cancelled' | 'expired';
          trial_started_at?: string | null;
          trial_expires_at?: string | null;
          subscription_started_at?: string | null;
          subscription_expires_at?: string | null;
          renewal_reminder_sent_at?: string | null;
          renewal_reminder_7d_sent?: boolean;
          renewal_reminder_3d_sent?: boolean;
          renewal_reminder_1d_sent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_history: {
        Row: {
          id: string;
          user_id: string;
          coinpayportal_payment_id: string;
          amount_usd: number;
          amount_crypto: string | null;
          crypto_currency: string | null;
          blockchain: string | null;
          tx_hash: string | null;
          merchant_tx_hash: string | null;
          platform_tx_hash: string | null;
          payment_address: string | null;
          status: string;
          plan: 'premium' | 'family';
          duration_months: number;
          period_start: string | null;
          period_end: string | null;
          webhook_received_at: string | null;
          webhook_event_type: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          coinpayportal_payment_id: string;
          amount_usd: number;
          amount_crypto?: string | null;
          crypto_currency?: string | null;
          blockchain?: string | null;
          tx_hash?: string | null;
          merchant_tx_hash?: string | null;
          platform_tx_hash?: string | null;
          payment_address?: string | null;
          status?: string;
          plan: 'premium' | 'family';
          duration_months?: number;
          period_start?: string | null;
          period_end?: string | null;
          webhook_received_at?: string | null;
          webhook_event_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          coinpayportal_payment_id?: string;
          amount_usd?: number;
          amount_crypto?: string | null;
          crypto_currency?: string | null;
          blockchain?: string | null;
          tx_hash?: string | null;
          merchant_tx_hash?: string | null;
          platform_tx_hash?: string | null;
          payment_address?: string | null;
          status?: string;
          plan?: 'premium' | 'family';
          duration_months?: number;
          period_start?: string | null;
          period_end?: string | null;
          webhook_received_at?: string | null;
          webhook_event_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      iptv_playlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          m3u_url: string;
          epg_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          m3u_url: string;
          epg_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          m3u_url?: string;
          epg_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      iptv_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          argontv_line_id: number;
          username: string;
          password: string;
          m3u_download_link: string;
          package_key: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          status: 'pending' | 'active' | 'expired' | 'cancelled';
          created_at: string;
          expires_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          argontv_line_id: number;
          username: string;
          password: string;
          m3u_download_link: string;
          package_key: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          status?: 'pending' | 'active' | 'expired' | 'cancelled';
          created_at?: string;
          expires_at: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          argontv_line_id?: number;
          username?: string;
          password?: string;
          m3u_download_link?: string;
          package_key?: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          status?: 'pending' | 'active' | 'expired' | 'cancelled';
          created_at?: string;
          expires_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      iptv_payment_history: {
        Row: {
          id: string;
          user_id: string;
          iptv_subscription_id: string | null;
          coinpayportal_payment_id: string;
          amount_usd: number;
          amount_crypto: string | null;
          crypto_currency: string | null;
          blockchain: string | null;
          tx_hash: string | null;
          payment_address: string | null;
          status: 'pending' | 'detected' | 'confirmed' | 'failed' | 'expired';
          payment_type: 'new_subscription' | 'extension';
          package_key: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          webhook_received_at: string | null;
          webhook_event_type: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          iptv_subscription_id?: string | null;
          coinpayportal_payment_id: string;
          amount_usd: number;
          amount_crypto?: string | null;
          crypto_currency?: string | null;
          blockchain?: string | null;
          tx_hash?: string | null;
          payment_address?: string | null;
          status?: 'pending' | 'detected' | 'confirmed' | 'failed' | 'expired';
          payment_type?: 'new_subscription' | 'extension';
          package_key: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          webhook_received_at?: string | null;
          webhook_event_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          iptv_subscription_id?: string | null;
          coinpayportal_payment_id?: string;
          amount_usd?: number;
          amount_crypto?: string | null;
          crypto_currency?: string | null;
          blockchain?: string | null;
          tx_hash?: string | null;
          payment_address?: string | null;
          status?: 'pending' | 'detected' | 'confirmed' | 'failed' | 'expired';
          payment_type?: 'new_subscription' | 'extension';
          package_key?: '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';
          webhook_received_at?: string | null;
          webhook_event_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'iptv_payment_history_iptv_subscription_id_fkey';
            columns: ['iptv_subscription_id'];
            isOneToOne: false;
            referencedRelation: 'iptv_subscriptions';
            referencedColumns: ['id'];
          }
        ];
      };
      podcasts: {
        Row: {
          id: string;
          feed_url: string;
          title: string;
          description: string | null;
          author: string | null;
          image_url: string | null;
          website_url: string | null;
          language: string | null;
          categories: string[] | null;
          last_episode_date: string | null;
          episode_count: number;
          search_vector: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          feed_url: string;
          title: string;
          description?: string | null;
          author?: string | null;
          image_url?: string | null;
          website_url?: string | null;
          language?: string | null;
          categories?: string[] | null;
          last_episode_date?: string | null;
          episode_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          feed_url?: string;
          title?: string;
          description?: string | null;
          author?: string | null;
          image_url?: string | null;
          website_url?: string | null;
          language?: string | null;
          categories?: string[] | null;
          last_episode_date?: string | null;
          episode_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      podcast_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          podcast_id: string;
          notify_new_episodes: boolean;
          last_listened_episode_id: string | null;
          last_listened_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          podcast_id: string;
          notify_new_episodes?: boolean;
          last_listened_episode_id?: string | null;
          last_listened_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          podcast_id?: string;
          notify_new_episodes?: boolean;
          last_listened_episode_id?: string | null;
          last_listened_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'podcast_subscriptions_podcast_id_fkey';
            columns: ['podcast_id'];
            isOneToOne: false;
            referencedRelation: 'podcasts';
            referencedColumns: ['id'];
          }
        ];
      };
      podcast_episodes: {
        Row: {
          id: string;
          podcast_id: string;
          guid: string;
          title: string;
          description: string | null;
          audio_url: string;
          duration_seconds: number | null;
          image_url: string | null;
          published_at: string;
          season_number: number | null;
          episode_number: number | null;
          search_vector: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          podcast_id: string;
          guid: string;
          title: string;
          description?: string | null;
          audio_url: string;
          duration_seconds?: number | null;
          image_url?: string | null;
          published_at: string;
          season_number?: number | null;
          episode_number?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          podcast_id?: string;
          guid?: string;
          title?: string;
          description?: string | null;
          audio_url?: string;
          duration_seconds?: number | null;
          image_url?: string | null;
          published_at?: string;
          season_number?: number | null;
          episode_number?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'podcast_episodes_podcast_id_fkey';
            columns: ['podcast_id'];
            isOneToOne: false;
            referencedRelation: 'podcasts';
            referencedColumns: ['id'];
          }
        ];
      };
      podcast_listen_progress: {
        Row: {
          id: string;
          user_id: string;
          episode_id: string;
          current_time_seconds: number;
          duration_seconds: number | null;
          percentage: number;
          completed: boolean;
          last_listened_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          episode_id: string;
          current_time_seconds?: number;
          duration_seconds?: number | null;
          percentage?: number;
          completed?: boolean;
          last_listened_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          episode_id?: string;
          current_time_seconds?: number;
          duration_seconds?: number | null;
          percentage?: number;
          completed?: boolean;
          last_listened_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'podcast_listen_progress_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'podcast_episodes';
            referencedColumns: ['id'];
          }
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent: string | null;
          is_active: boolean;
          last_used_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent?: string | null;
          is_active?: boolean;
          last_used_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh_key?: string;
          auth_key?: string;
          user_agent?: string | null;
          is_active?: boolean;
          last_used_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_plans: {
        Row: {
          id: string;
          owner_id: string;
          plan_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          plan_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          plan_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          id: string;
          family_plan_id: string;
          user_id: string;
          email: string;
          role: 'owner' | 'admin' | 'member';
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_plan_id: string;
          user_id: string;
          email: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_plan_id?: string;
          user_id?: string;
          email?: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'family_members_family_plan_id_fkey';
            columns: ['family_plan_id'];
            isOneToOne: false;
            referencedRelation: 'family_plans';
            referencedColumns: ['id'];
          }
        ];
      };
      family_invitations: {
        Row: {
          id: string;
          family_plan_id: string;
          inviter_id: string;
          inviter_email: string;
          invitee_email: string;
          invite_code: string;
          status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_plan_id: string;
          inviter_id: string;
          inviter_email: string;
          invitee_email: string;
          invite_code: string;
          status?: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_plan_id?: string;
          inviter_id?: string;
          inviter_email?: string;
          invitee_email?: string;
          invite_code?: string;
          status?: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'family_invitations_family_plan_id_fkey';
            columns: ['family_plan_id'];
            isOneToOne: false;
            referencedRelation: 'family_plans';
            referencedColumns: ['id'];
          }
        ];
      };
      notification_history: {
        Row: {
          id: string;
          user_id: string;
          push_subscription_id: string | null;
          notification_type: string;
          title: string;
          body: string | null;
          data: Record<string, unknown> | null;
          status: 'pending' | 'sent' | 'failed' | 'clicked';
          error_message: string | null;
          podcast_id: string | null;
          episode_id: string | null;
          sent_at: string | null;
          clicked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          push_subscription_id?: string | null;
          notification_type: string;
          title: string;
          body?: string | null;
          data?: Record<string, unknown> | null;
          status?: 'pending' | 'sent' | 'failed' | 'clicked';
          error_message?: string | null;
          podcast_id?: string | null;
          episode_id?: string | null;
          sent_at?: string | null;
          clicked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          push_subscription_id?: string | null;
          notification_type?: string;
          title?: string;
          body?: string | null;
          data?: Record<string, unknown> | null;
          status?: 'pending' | 'sent' | 'failed' | 'clicked';
          error_message?: string | null;
          podcast_id?: string | null;
          episode_id?: string | null;
          sent_at?: string | null;
          clicked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_history_push_subscription_id_fkey';
            columns: ['push_subscription_id'];
            isOneToOne: false;
            referencedRelation: 'push_subscriptions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_history_podcast_id_fkey';
            columns: ['podcast_id'];
            isOneToOne: false;
            referencedRelation: 'podcasts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_history_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'podcast_episodes';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_torrent_comments: {
        Row: {
          id: string;
          torrent_id: string;
          user_id: string;
          content: string;
          parent_id: string | null;
          upvotes: number;
          downvotes: number;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          torrent_id: string;
          user_id: string;
          content: string;
          parent_id?: string | null;
          upvotes?: number;
          downvotes?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          torrent_id?: string;
          user_id?: string;
          content?: string;
          parent_id?: string | null;
          upvotes?: number;
          downvotes?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_torrent_comments_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bt_torrent_comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrent_comments';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_comment_votes: {
        Row: {
          id: string;
          comment_id: string;
          user_id: string;
          vote_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          user_id: string;
          vote_value: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          comment_id?: string;
          user_id?: string;
          vote_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_comment_votes_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrent_comments';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_torrent_votes: {
        Row: {
          id: string;
          torrent_id: string;
          user_id: string;
          vote_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          torrent_id: string;
          user_id: string;
          vote_value: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          torrent_id?: string;
          user_id?: string;
          vote_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_torrent_votes_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrents';
            referencedColumns: ['id'];
          }
        ];
      };
      bt_torrent_favorites: {
        Row: {
          id: string;
          user_id: string;
          torrent_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          torrent_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          torrent_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bt_torrent_favorites_torrent_id_fkey';
            columns: ['torrent_id'];
            isOneToOne: false;
            referencedRelation: 'bt_torrents';
            referencedColumns: ['id'];
          }
        ];
      };
      iptv_channel_favorites: {
        Row: {
          id: string;
          user_id: string;
          playlist_id: string;
          channel_id: string;
          channel_name: string;
          channel_url: string;
          channel_logo: string | null;
          channel_group: string | null;
          tvg_id: string | null;
          tvg_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          playlist_id: string;
          channel_id: string;
          channel_name: string;
          channel_url: string;
          channel_logo?: string | null;
          channel_group?: string | null;
          tvg_id?: string | null;
          tvg_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_id?: string;
          channel_id?: string;
          channel_name?: string;
          channel_url?: string;
          channel_logo?: string | null;
          channel_group?: string | null;
          tvg_id?: string | null;
          tvg_name?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iptv_channel_favorites_playlist_id_fkey';
            columns: ['playlist_id'];
            isOneToOne: false;
            referencedRelation: 'iptv_playlists';
            referencedColumns: ['id'];
          }
        ];
      };
      radio_station_favorites: {
        Row: {
          id: string;
          user_id: string;
          station_id: string;
          station_name: string;
          station_image_url: string | null;
          station_genre: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          station_id: string;
          station_name: string;
          station_image_url?: string | null;
          station_genre?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          station_id?: string;
          station_name?: string;
          station_image_url?: string | null;
          station_genre?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_all_torrents: {
        Args: {
          search_query: string;
          result_limit?: number;
          result_offset?: number;
        };
        Returns: {
          id: string;
          infohash: string;
          name: string;
          magnet_uri: string;
          size: number;
          files_count: number;
          seeders: number;
          leechers: number;
          created_at: string;
          poster_url: string | null;
          cover_url: string | null;
          content_type: string | null;
          source: string;
        }[];
      };
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
      get_subscription_status: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          subscription_id: string;
          tier: string;
          status: string;
          is_active: boolean;
          days_remaining: number;
          expires_at: string | null;
          needs_renewal: boolean;
        }[];
      };
      activate_subscription: {
        Args: {
          p_user_id: string;
          p_tier: string;
          p_duration_months?: number;
        };
        Returns: Tables<'user_subscriptions'>;
      };
      get_subscriptions_needing_reminders: {
        Args: {
          p_days_before: number;
        };
        Returns: {
          user_id: string;
          tier: string;
          subscription_expires_at: string;
          days_until_expiry: number;
          user_email: string;
        }[];
      };
      mark_renewal_reminder_sent: {
        Args: {
          p_user_id: string;
          p_days_before: number;
        };
        Returns: void;
      };
      search_podcasts: {
        Args: {
          search_query: string;
          result_limit?: number;
          result_offset?: number;
        };
        Returns: {
          podcast_id: string;
          podcast_title: string;
          podcast_author: string | null;
          podcast_description: string | null;
          podcast_image_url: string | null;
          podcast_feed_url: string;
          podcast_episode_count: number;
          rank: number;
        }[];
      };
      get_user_podcast_subscriptions: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          subscription_id: string;
          podcast_id: string;
          podcast_title: string;
          podcast_author: string | null;
          podcast_image_url: string | null;
          podcast_feed_url: string;
          notify_new_episodes: boolean;
          latest_episode_title: string | null;
          latest_episode_published_at: string | null;
          unlistened_count: number;
          subscribed_at: string;
        }[];
      };
      get_users_to_notify_new_episode: {
        Args: {
          p_podcast_id: string;
          p_episode_id: string;
        };
        Returns: {
          user_id: string;
          push_endpoint: string;
          p256dh_key: string;
          auth_key: string;
        }[];
      };
      create_family_plan_for_user: {
        Args: {
          p_user_id: string;
          p_user_email: string;
          p_plan_name?: string;
        };
        Returns: Tables<'family_plans'>;
      };
      get_user_family_plan: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          family_plan_id: string;
          plan_name: string;
          owner_id: string;
          owner_email: string;
          member_count: number;
          user_role: string;
          created_at: string;
        }[];
      };
      get_family_members: {
        Args: {
          p_family_plan_id: string;
        };
        Returns: {
          member_id: string;
          user_id: string;
          email: string;
          role: string;
          joined_at: string;
        }[];
      };
      get_family_invitations: {
        Args: {
          p_family_plan_id: string;
        };
        Returns: {
          invitation_id: string;
          invitee_email: string;
          invite_code: string;
          status: string;
          expires_at: string;
          created_at: string;
        }[];
      };
      accept_family_invitation: {
        Args: {
          p_invite_code: string;
          p_user_id: string;
          p_user_email: string;
        };
        Returns: {
          success: boolean;
          message: string;
          family_plan_id: string | null;
        }[];
      };
      remove_family_member: {
        Args: {
          p_family_plan_id: string;
          p_member_id: string;
          p_requester_id: string;
        };
        Returns: {
          success: boolean;
          message: string;
        }[];
      };
      revoke_family_invitation: {
        Args: {
          p_invitation_id: string;
          p_requester_id: string;
        };
        Returns: {
          success: boolean;
          message: string;
        }[];
      };
      can_invite_family_member: {
        Args: {
          p_family_plan_id: string;
        };
        Returns: boolean;
      };
      get_family_owner_id: {
        Args: {
          p_user_id: string;
        };
        Returns: string | null;
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
export type Torrent = Tables<'bt_torrents'>;
export type TorrentInsert = InsertTables<'bt_torrents'>;
export type TorrentUpdate = UpdateTables<'bt_torrents'>;

export type TorrentFile = Tables<'bt_torrent_files'>;
export type TorrentFileInsert = InsertTables<'bt_torrent_files'>;
export type TorrentFileUpdate = UpdateTables<'bt_torrent_files'>;

export type TorrentFolder = Tables<'bt_torrent_folders'>;
export type TorrentFolderInsert = InsertTables<'bt_torrent_folders'>;
export type TorrentFolderUpdate = UpdateTables<'bt_torrent_folders'>;

export type AudioMetadata = Tables<'bt_audio_metadata'>;
export type AudioMetadataInsert = InsertTables<'bt_audio_metadata'>;
export type AudioMetadataUpdate = UpdateTables<'bt_audio_metadata'>;

export type VideoMetadata = Tables<'bt_video_metadata'>;
export type VideoMetadataInsert = InsertTables<'bt_video_metadata'>;
export type VideoMetadataUpdate = UpdateTables<'bt_video_metadata'>;

export type EbookMetadata = Tables<'bt_ebook_metadata'>;
export type EbookMetadataInsert = InsertTables<'bt_ebook_metadata'>;
export type EbookMetadataUpdate = UpdateTables<'bt_ebook_metadata'>;

export type UserFavorite = Tables<'user_favorites'>;
export type Collection = Tables<'collections'>;
export type CollectionItem = Tables<'collection_items'>;
export type ReadingProgress = Tables<'reading_progress'>;
export type WatchProgress = Tables<'watch_progress'>;
export type RateLimit = Tables<'rate_limits'>;

// Subscription and payment types
export type UserSubscription = Tables<'user_subscriptions'>;
export type UserSubscriptionInsert = InsertTables<'user_subscriptions'>;
export type UserSubscriptionUpdate = UpdateTables<'user_subscriptions'>;

export type PaymentHistory = Tables<'payment_history'>;
export type PaymentHistoryInsert = InsertTables<'payment_history'>;
export type PaymentHistoryUpdate = UpdateTables<'payment_history'>;

// Subscription tier type
export type SubscriptionTier = 'trial' | 'premium' | 'family';

// Subscription status type
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

// Payment plan type
export type PaymentPlan = 'premium' | 'family';

// Media category type
export type MediaCategory = 'audio' | 'video' | 'ebook' | 'document' | 'other';

// Collection type
export type CollectionType = 'playlist' | 'watchlist' | 'reading_list' | 'mixed';

// IPTV Playlist types
export type IptvPlaylist = Tables<'iptv_playlists'>;
export type IptvPlaylistInsert = InsertTables<'iptv_playlists'>;
export type IptvPlaylistUpdate = UpdateTables<'iptv_playlists'>;

// IPTV Subscription types
export type IptvSubscription = Tables<'iptv_subscriptions'>;
export type IptvSubscriptionInsert = InsertTables<'iptv_subscriptions'>;
export type IptvSubscriptionUpdate = UpdateTables<'iptv_subscriptions'>;

// IPTV Payment History types
export type IptvPaymentHistory = Tables<'iptv_payment_history'>;
export type IptvPaymentHistoryInsert = InsertTables<'iptv_payment_history'>;
export type IptvPaymentHistoryUpdate = UpdateTables<'iptv_payment_history'>;

// IPTV Package key type
export type IptvPackageKey = '1_month' | '3_months' | '6_months' | '12_months' | '24_hour_test' | '3_hour_test';

// IPTV Subscription status type
export type IptvSubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';

// IPTV Payment status type
export type IptvPaymentStatus = 'pending' | 'detected' | 'confirmed' | 'failed' | 'expired';

// IPTV Payment type
export type IptvPaymentType = 'new_subscription' | 'extension';

// Podcast types
export type Podcast = Tables<'podcasts'>;
export type PodcastInsert = InsertTables<'podcasts'>;
export type PodcastUpdate = UpdateTables<'podcasts'>;

export type PodcastSubscription = Tables<'podcast_subscriptions'>;
export type PodcastSubscriptionInsert = InsertTables<'podcast_subscriptions'>;
export type PodcastSubscriptionUpdate = UpdateTables<'podcast_subscriptions'>;

export type PodcastEpisode = Tables<'podcast_episodes'>;
export type PodcastEpisodeInsert = InsertTables<'podcast_episodes'>;
export type PodcastEpisodeUpdate = UpdateTables<'podcast_episodes'>;

export type PodcastListenProgress = Tables<'podcast_listen_progress'>;
export type PodcastListenProgressInsert = InsertTables<'podcast_listen_progress'>;
export type PodcastListenProgressUpdate = UpdateTables<'podcast_listen_progress'>;

// Push notification types
export type PushSubscription = Tables<'push_subscriptions'>;
export type PushSubscriptionInsert = InsertTables<'push_subscriptions'>;
export type PushSubscriptionUpdate = UpdateTables<'push_subscriptions'>;

export type NotificationHistory = Tables<'notification_history'>;
export type NotificationHistoryInsert = InsertTables<'notification_history'>;
export type NotificationHistoryUpdate = UpdateTables<'notification_history'>;

// Notification status type
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'clicked';

// Family plan types
export type FamilyPlan = Tables<'family_plans'>;
export type FamilyPlanInsert = InsertTables<'family_plans'>;
export type FamilyPlanUpdate = UpdateTables<'family_plans'>;

export type FamilyMember = Tables<'family_members'>;
export type FamilyMemberInsert = InsertTables<'family_members'>;
export type FamilyMemberUpdate = UpdateTables<'family_members'>;

export type FamilyInvitation = Tables<'family_invitations'>;
export type FamilyInvitationInsert = InsertTables<'family_invitations'>;
export type FamilyInvitationUpdate = UpdateTables<'family_invitations'>;

// Family member role type
export type FamilyMemberRole = 'owner' | 'admin' | 'member';

// Family invitation status type
export type FamilyInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

// Comment types
export type TorrentComment = Tables<'bt_torrent_comments'>;
export type TorrentCommentInsert = InsertTables<'bt_torrent_comments'>;
export type TorrentCommentUpdate = UpdateTables<'bt_torrent_comments'>;

// Comment vote types
export type CommentVote = Tables<'bt_comment_votes'>;
export type CommentVoteInsert = InsertTables<'bt_comment_votes'>;
export type CommentVoteUpdate = UpdateTables<'bt_comment_votes'>;

// Torrent vote types
export type TorrentVote = Tables<'bt_torrent_votes'>;
export type TorrentVoteInsert = InsertTables<'bt_torrent_votes'>;
export type TorrentVoteUpdate = UpdateTables<'bt_torrent_votes'>;

// Vote value type
export type VoteValue = 1 | -1;

// Torrent favorites types
export type TorrentFavorite = Tables<'bt_torrent_favorites'>;
export type TorrentFavoriteInsert = InsertTables<'bt_torrent_favorites'>;
export type TorrentFavoriteUpdate = UpdateTables<'bt_torrent_favorites'>;

// IPTV channel favorites types
export type IptvChannelFavorite = Tables<'iptv_channel_favorites'>;
export type IptvChannelFavoriteInsert = InsertTables<'iptv_channel_favorites'>;
export type IptvChannelFavoriteUpdate = UpdateTables<'iptv_channel_favorites'>;

// Radio station favorites types
export type RadioStationFavorite = Tables<'radio_station_favorites'>;
export type RadioStationFavoriteInsert = InsertTables<'radio_station_favorites'>;
export type RadioStationFavoriteUpdate = UpdateTables<'radio_station_favorites'>;

// User profile types (manually defined until migration is applied)
export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  comment_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInsert {
  user_id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  is_public?: boolean;
}

export interface UserProfileUpdate {
  username?: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  is_public?: boolean;
}

/**
 * Public user profile (for display, excludes private fields)
 */
export interface PublicUserProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  comment_count: number;
  favorite_count: number;
  created_at: string;
}
