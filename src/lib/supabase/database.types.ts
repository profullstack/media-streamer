export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audio_metadata: {
        Row: {
          album: string | null
          artist: string | null
          bitrate: number | null
          codec: string | null
          codec_detected_at: string | null
          container: string | null
          created_at: string | null
          duration_seconds: number | null
          file_id: string
          genre: string | null
          id: string
          needs_transcoding: boolean | null
          sample_rate: number | null
          search_vector: unknown
          title: string | null
          track_number: number | null
          year: number | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          bitrate?: number | null
          codec?: string | null
          codec_detected_at?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id: string
          genre?: string | null
          id?: string
          needs_transcoding?: boolean | null
          sample_rate?: number | null
          search_vector?: unknown
          title?: string | null
          track_number?: number | null
          year?: number | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          bitrate?: number | null
          codec?: string | null
          codec_detected_at?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id?: string
          genre?: string | null
          id?: string
          needs_transcoding?: boolean | null
          sample_rate?: number | null
          search_vector?: unknown
          title?: string | null
          track_number?: number | null
          year?: number | null
        }
        Relationships: []
      }
      bloom_filters: {
        Row: {
          bytes: string
          created_at: string
          key: string
          updated_at: string
        }
        Insert: {
          bytes: string
          created_at: string
          key: string
          updated_at: string
        }
        Update: {
          bytes?: string
          created_at?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      bt_audio_metadata: {
        Row: {
          album: string | null
          artist: string | null
          bitrate: number | null
          codec: string | null
          container: string | null
          created_at: string | null
          duration_seconds: number | null
          file_id: string
          genre: string | null
          id: string
          sample_rate: number | null
          search_vector: unknown
          title: string | null
          track_number: number | null
          year: number | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          bitrate?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id: string
          genre?: string | null
          id?: string
          sample_rate?: number | null
          search_vector?: unknown
          title?: string | null
          track_number?: number | null
          year?: number | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          bitrate?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id?: string
          genre?: string | null
          id?: string
          sample_rate?: number | null
          search_vector?: unknown
          title?: string | null
          track_number?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bt_audio_metadata_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "bt_torrent_files"
            referencedColumns: ["id"]
          },
        ]
      }
      bt_ebook_metadata: {
        Row: {
          author: string | null
          created_at: string | null
          file_id: string
          id: string
          isbn: string | null
          language: string | null
          page_count: number | null
          publisher: string | null
          search_vector: unknown
          title: string | null
          year: number | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          file_id: string
          id?: string
          isbn?: string | null
          language?: string | null
          page_count?: number | null
          publisher?: string | null
          search_vector?: unknown
          title?: string | null
          year?: number | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          file_id?: string
          id?: string
          isbn?: string | null
          language?: string | null
          page_count?: number | null
          publisher?: string | null
          search_vector?: unknown
          title?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bt_ebook_metadata_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "bt_torrent_files"
            referencedColumns: ["id"]
          },
        ]
      }
      bt_torrent_files: {
        Row: {
          created_at: string | null
          extension: string | null
          file_index: number
          id: string
          media_category: string | null
          mime_type: string | null
          name: string
          path: string
          piece_end: number | null
          piece_start: number | null
          search_vector: unknown
          size: number
          torrent_id: string
        }
        Insert: {
          created_at?: string | null
          extension?: string | null
          file_index: number
          id?: string
          media_category?: string | null
          mime_type?: string | null
          name: string
          path: string
          piece_end?: number | null
          piece_start?: number | null
          search_vector?: unknown
          size: number
          torrent_id: string
        }
        Update: {
          created_at?: string | null
          extension?: string | null
          file_index?: number
          id?: string
          media_category?: string | null
          mime_type?: string | null
          name?: string
          path?: string
          piece_end?: number | null
          piece_start?: number | null
          search_vector?: unknown
          size?: number
          torrent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bt_torrent_files_torrent_id_fkey"
            columns: ["torrent_id"]
            isOneToOne: false
            referencedRelation: "bt_torrents"
            referencedColumns: ["id"]
          },
        ]
      }
      bt_torrent_folders: {
        Row: {
          album: string | null
          artist: string | null
          cover_url: string | null
          created_at: string | null
          file_count: number | null
          id: string
          path: string
          torrent_id: string
          total_size: number | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          cover_url?: string | null
          created_at?: string | null
          file_count?: number | null
          id?: string
          path: string
          torrent_id: string
          total_size?: number | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          cover_url?: string | null
          created_at?: string | null
          file_count?: number | null
          id?: string
          path?: string
          torrent_id?: string
          total_size?: number | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bt_torrent_folders_torrent_id_fkey"
            columns: ["torrent_id"]
            isOneToOne: false
            referencedRelation: "bt_torrents"
            referencedColumns: ["id"]
          },
        ]
      }
      bt_torrents: {
        Row: {
          actors: string[] | null
          album: string | null
          album_cover_url: string | null
          artist: string | null
          artist_image_url: string | null
          audio_codec: string | null
          clean_title: string | null
          container: string | null
          content_type: string | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          director: string | null
          downvotes: number
          error_message: string | null
          external_id: string | null
          external_source: string | null
          file_count: number
          genre: string | null
          id: string
          indexed_at: string | null
          infohash: string
          leechers: number | null
          magnet_uri: string
          metadata_fetched_at: string | null
          name: string
          needs_transcoding: boolean | null
          piece_length: number | null
          poster_url: string | null
          search_vector: unknown
          seeders: number | null
          status: string | null
          swarm_updated_at: string | null
          total_size: number
          updated_at: string | null
          upvotes: number
          video_codec: string | null
          year: number | null
        }
        Insert: {
          actors?: string[] | null
          album?: string | null
          album_cover_url?: string | null
          artist?: string | null
          artist_image_url?: string | null
          audio_codec?: string | null
          clean_title?: string | null
          container?: string | null
          content_type?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          director?: string | null
          downvotes?: number
          error_message?: string | null
          external_id?: string | null
          external_source?: string | null
          file_count?: number
          genre?: string | null
          id?: string
          indexed_at?: string | null
          infohash: string
          leechers?: number | null
          magnet_uri: string
          metadata_fetched_at?: string | null
          name: string
          needs_transcoding?: boolean | null
          piece_length?: number | null
          poster_url?: string | null
          search_vector?: unknown
          seeders?: number | null
          status?: string | null
          swarm_updated_at?: string | null
          total_size?: number
          updated_at?: string | null
          upvotes?: number
          video_codec?: string | null
          year?: number | null
        }
        Update: {
          actors?: string[] | null
          album?: string | null
          album_cover_url?: string | null
          artist?: string | null
          artist_image_url?: string | null
          audio_codec?: string | null
          clean_title?: string | null
          container?: string | null
          content_type?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          director?: string | null
          downvotes?: number
          error_message?: string | null
          external_id?: string | null
          external_source?: string | null
          file_count?: number
          genre?: string | null
          id?: string
          indexed_at?: string | null
          infohash?: string
          leechers?: number | null
          magnet_uri?: string
          metadata_fetched_at?: string | null
          name?: string
          needs_transcoding?: boolean | null
          piece_length?: number | null
          poster_url?: string | null
          search_vector?: unknown
          seeders?: number | null
          status?: string | null
          swarm_updated_at?: string | null
          total_size?: number
          updated_at?: string | null
          upvotes?: number
          video_codec?: string | null
          year?: number | null
        }
        Relationships: []
      }
      bt_video_metadata: {
        Row: {
          audio_codec: string | null
          bitrate: number | null
          codec: string | null
          container: string | null
          created_at: string | null
          duration_seconds: number | null
          file_id: string
          framerate: number | null
          height: number | null
          id: string
          needs_transcoding: boolean | null
          search_vector: unknown
          title: string | null
          width: number | null
        }
        Insert: {
          audio_codec?: string | null
          bitrate?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id: string
          framerate?: number | null
          height?: number | null
          id?: string
          needs_transcoding?: boolean | null
          search_vector?: unknown
          title?: string | null
          width?: number | null
        }
        Update: {
          audio_codec?: string | null
          bitrate?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id?: string
          framerate?: number | null
          height?: number | null
          id?: string
          needs_transcoding?: boolean | null
          search_vector?: unknown
          title?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bt_video_metadata_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "bt_torrent_files"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          collection_id: string
          created_at: string | null
          file_id: string
          id: string
          position: number
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          file_id: string
          id?: string
          position: number
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          file_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          collection_type: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          collection_type: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          collection_type?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
          vote_value: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          vote_value: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          vote_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "torrent_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          adult: boolean | null
          created_at: string
          id: string
          original_language: string | null
          original_title: string | null
          overview: string | null
          popularity: number | null
          release_date: string | null
          release_year: number | null
          runtime: number | null
          source: string
          title: string
          tsv: unknown
          type: string
          updated_at: string
          vote_average: number | null
          vote_count: number | null
        }
        Insert: {
          adult?: boolean | null
          created_at: string
          id: string
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          popularity?: number | null
          release_date?: string | null
          release_year?: number | null
          runtime?: number | null
          source: string
          title: string
          tsv?: unknown
          type: string
          updated_at: string
          vote_average?: number | null
          vote_count?: number | null
        }
        Update: {
          adult?: boolean | null
          created_at?: string
          id?: string
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          popularity?: number | null
          release_date?: string | null
          release_year?: number | null
          runtime?: number | null
          source?: string
          title?: string
          tsv?: unknown
          type?: string
          updated_at?: string
          vote_average?: number | null
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
        ]
      }
      content_attributes: {
        Row: {
          content_id: string
          content_source: string
          content_type: string
          created_at: string
          key: string
          source: string
          updated_at: string
          value: string
        }
        Insert: {
          content_id: string
          content_source: string
          content_type: string
          created_at: string
          key: string
          source: string
          updated_at: string
          value: string
        }
        Update: {
          content_id?: string
          content_source?: string
          content_type?: string
          created_at?: string
          key?: string
          source?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_attributes_content_source_fkey"
            columns: ["content_source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "content_attributes_content_type_content_source_content_id_fkey"
            columns: ["content_type", "content_source", "content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["type", "source", "id"]
          },
          {
            foreignKeyName: "content_attributes_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
        ]
      }
      content_collections: {
        Row: {
          created_at: string
          id: string
          name: string
          source: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at: string
          id: string
          name: string
          source: string
          type: string
          updated_at: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          source?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_collections_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
        ]
      }
      content_collections_content: {
        Row: {
          content_collection_id: string
          content_collection_source: string
          content_collection_type: string
          content_id: string
          content_source: string
          content_type: string
        }
        Insert: {
          content_collection_id: string
          content_collection_source: string
          content_collection_type: string
          content_id: string
          content_source: string
          content_type: string
        }
        Update: {
          content_collection_id?: string
          content_collection_source?: string
          content_collection_type?: string
          content_id?: string
          content_source?: string
          content_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_collections_content_content_collection_source_fkey"
            columns: ["content_collection_source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "content_collections_content_content_collection_type_conten_fkey"
            columns: [
              "content_collection_type",
              "content_collection_source",
              "content_collection_id",
            ]
            isOneToOne: false
            referencedRelation: "content_collections"
            referencedColumns: ["type", "source", "id"]
          },
          {
            foreignKeyName: "content_collections_content_content_source_fkey"
            columns: ["content_source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "content_collections_content_content_type_content_source_co_fkey"
            columns: ["content_type", "content_source", "content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["type", "source", "id"]
          },
        ]
      }
      dht_api_keys: {
        Row: {
          created_at: string | null
          daily_limit: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          metadata: Json | null
          monthly_limit: number | null
          name: string | null
          owner_email: string | null
          rate_limit_per_min: number | null
          tier: string
        }
        Insert: {
          created_at?: string | null
          daily_limit?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          metadata?: Json | null
          monthly_limit?: number | null
          name?: string | null
          owner_email?: string | null
          rate_limit_per_min?: number | null
          tier?: string
        }
        Update: {
          created_at?: string | null
          daily_limit?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          metadata?: Json | null
          monthly_limit?: number | null
          name?: string | null
          owner_email?: string | null
          rate_limit_per_min?: number | null
          tier?: string
        }
        Relationships: []
      }
      dht_rate_limits: {
        Row: {
          api_key_id: string
          request_count: number | null
          updated_at: string | null
          window_start: string
        }
        Insert: {
          api_key_id: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string
        }
        Update: {
          api_key_id?: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "dht_rate_limits_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: true
            referencedRelation: "dht_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      dht_usage_daily: {
        Row: {
          api_key_id: string
          avg_response_ms: number | null
          bandwidth_bytes: number | null
          date: string
          error_count: number | null
          request_count: number | null
        }
        Insert: {
          api_key_id: string
          avg_response_ms?: number | null
          bandwidth_bytes?: number | null
          date: string
          error_count?: number | null
          request_count?: number | null
        }
        Update: {
          api_key_id?: string
          avg_response_ms?: number | null
          bandwidth_bytes?: number | null
          date?: string
          error_count?: number | null
          request_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dht_usage_daily_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "dht_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      dht_usage_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: number
          method: string
          query_params: Json | null
          request_ip: string | null
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: number
          method: string
          query_params?: Json | null
          request_ip?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: number
          method?: string
          query_params?: Json | null
          request_ip?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dht_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "dht_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      ebook_metadata: {
        Row: {
          author: string | null
          created_at: string | null
          file_id: string
          id: string
          isbn: string | null
          language: string | null
          page_count: number | null
          publisher: string | null
          search_vector: unknown
          title: string | null
          year: number | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          file_id: string
          id?: string
          isbn?: string | null
          language?: string | null
          page_count?: number | null
          publisher?: string | null
          search_vector?: unknown
          title?: string | null
          year?: number | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          file_id?: string
          id?: string
          isbn?: string | null
          language?: string | null
          page_count?: number | null
          publisher?: string | null
          search_vector?: unknown
          title?: string | null
          year?: number | null
        }
        Relationships: []
      }
      family_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          expires_at: string
          family_plan_id: string
          id: string
          invite_code: string
          invitee_email: string
          inviter_email: string
          inviter_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          expires_at: string
          family_plan_id: string
          id?: string
          invite_code: string
          invitee_email: string
          inviter_email: string
          inviter_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          expires_at?: string
          family_plan_id?: string
          id?: string
          invite_code?: string
          invitee_email?: string
          inviter_email?: string
          inviter_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_invitations_family_plan_id_fkey"
            columns: ["family_plan_id"]
            isOneToOne: false
            referencedRelation: "family_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string | null
          email: string
          family_plan_id: string
          id: string
          joined_at: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          family_plan_id: string
          id?: string
          joined_at?: string | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          family_plan_id?: string
          id?: string
          joined_at?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_plan_id_fkey"
            columns: ["family_plan_id"]
            isOneToOne: false
            referencedRelation: "family_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      family_plans: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string
          plan_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id: string
          plan_name?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string
          plan_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      goose_db_version: {
        Row: {
          id: number
          is_applied: boolean
          tstamp: string
          version_id: number
        }
        Insert: {
          id?: number
          is_applied: boolean
          tstamp?: string
          version_id: number
        }
        Update: {
          id?: number
          is_applied?: boolean
          tstamp?: string
          version_id?: number
        }
        Relationships: []
      }
      iptv_channel_favorites: {
        Row: {
          channel_group: string | null
          channel_id: string
          channel_logo: string | null
          channel_name: string
          channel_url: string
          created_at: string | null
          id: string
          playlist_id: string
          tvg_id: string | null
          tvg_name: string | null
          user_id: string
        }
        Insert: {
          channel_group?: string | null
          channel_id: string
          channel_logo?: string | null
          channel_name: string
          channel_url: string
          created_at?: string | null
          id?: string
          playlist_id: string
          tvg_id?: string | null
          tvg_name?: string | null
          user_id: string
        }
        Update: {
          channel_group?: string | null
          channel_id?: string
          channel_logo?: string | null
          channel_name?: string
          channel_url?: string
          created_at?: string | null
          id?: string
          playlist_id?: string
          tvg_id?: string | null
          tvg_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_channel_favorites_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "iptv_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_payment_history: {
        Row: {
          amount_crypto: string | null
          amount_usd: number
          blockchain: string | null
          coinpayportal_payment_id: string
          completed_at: string | null
          created_at: string
          crypto_currency: string | null
          id: string
          iptv_subscription_id: string | null
          metadata: Json | null
          package_key: string
          payment_address: string | null
          payment_type: string
          status: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          webhook_event_type: string | null
          webhook_received_at: string | null
        }
        Insert: {
          amount_crypto?: string | null
          amount_usd: number
          blockchain?: string | null
          coinpayportal_payment_id: string
          completed_at?: string | null
          created_at?: string
          crypto_currency?: string | null
          id?: string
          iptv_subscription_id?: string | null
          metadata?: Json | null
          package_key: string
          payment_address?: string | null
          payment_type?: string
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          webhook_event_type?: string | null
          webhook_received_at?: string | null
        }
        Update: {
          amount_crypto?: string | null
          amount_usd?: number
          blockchain?: string | null
          coinpayportal_payment_id?: string
          completed_at?: string | null
          created_at?: string
          crypto_currency?: string | null
          id?: string
          iptv_subscription_id?: string | null
          metadata?: Json | null
          package_key?: string
          payment_address?: string | null
          payment_type?: string
          status?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          webhook_event_type?: string | null
          webhook_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iptv_payment_history_iptv_subscription_id_fkey"
            columns: ["iptv_subscription_id"]
            isOneToOne: false
            referencedRelation: "iptv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_playlists: {
        Row: {
          created_at: string | null
          epg_url: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          m3u_url: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          epg_url?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          m3u_url: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          epg_url?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          m3u_url?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      iptv_subscriptions: {
        Row: {
          argontv_line_id: number
          created_at: string
          expires_at: string
          id: string
          m3u_download_link: string
          package_key: string
          password: string
          status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          argontv_line_id: number
          created_at?: string
          expires_at: string
          id?: string
          m3u_download_link: string
          package_key: string
          password: string
          status?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          argontv_line_id?: number
          created_at?: string
          expires_at?: string
          id?: string
          m3u_download_link?: string
          package_key?: string
          password?: string
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      key_values: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      metadata_sources: {
        Row: {
          created_at: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at: string
          key: string
          name: string
          updated_at: string
        }
        Update: {
          created_at?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_history: {
        Row: {
          body: string | null
          clicked_at: string | null
          created_at: string | null
          data: Json | null
          episode_id: string | null
          error_message: string | null
          id: string
          notification_type: string
          podcast_id: string | null
          push_subscription_id: string | null
          sent_at: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          clicked_at?: string | null
          created_at?: string | null
          data?: Json | null
          episode_id?: string | null
          error_message?: string | null
          id?: string
          notification_type: string
          podcast_id?: string | null
          push_subscription_id?: string | null
          sent_at?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          clicked_at?: string | null
          created_at?: string | null
          data?: Json | null
          episode_id?: string | null
          error_message?: string | null
          id?: string
          notification_type?: string
          podcast_id?: string | null
          push_subscription_id?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_push_subscription_id_fkey"
            columns: ["push_subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          amount_crypto: string | null
          amount_usd: number
          blockchain: string | null
          coinpayportal_payment_id: string
          completed_at: string | null
          created_at: string | null
          crypto_currency: string | null
          duration_months: number
          id: string
          merchant_tx_hash: string | null
          metadata: Json | null
          payment_address: string | null
          period_end: string | null
          period_start: string | null
          plan: string
          platform_tx_hash: string | null
          status: string
          tx_hash: string | null
          updated_at: string | null
          user_id: string
          webhook_event_type: string | null
          webhook_received_at: string | null
        }
        Insert: {
          amount_crypto?: string | null
          amount_usd: number
          blockchain?: string | null
          coinpayportal_payment_id: string
          completed_at?: string | null
          created_at?: string | null
          crypto_currency?: string | null
          duration_months?: number
          id?: string
          merchant_tx_hash?: string | null
          metadata?: Json | null
          payment_address?: string | null
          period_end?: string | null
          period_start?: string | null
          plan: string
          platform_tx_hash?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string | null
          user_id: string
          webhook_event_type?: string | null
          webhook_received_at?: string | null
        }
        Update: {
          amount_crypto?: string | null
          amount_usd?: number
          blockchain?: string | null
          coinpayportal_payment_id?: string
          completed_at?: string | null
          created_at?: string | null
          crypto_currency?: string | null
          duration_months?: number
          id?: string
          merchant_tx_hash?: string | null
          metadata?: Json | null
          payment_address?: string | null
          period_end?: string | null
          period_start?: string | null
          plan?: string
          platform_tx_hash?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string | null
          user_id?: string
          webhook_event_type?: string | null
          webhook_received_at?: string | null
        }
        Relationships: []
      }
      podcast_episodes: {
        Row: {
          audio_url: string
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          episode_number: number | null
          guid: string
          id: string
          image_url: string | null
          podcast_id: string
          published_at: string
          search_vector: unknown
          season_number: number | null
          title: string
        }
        Insert: {
          audio_url: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          episode_number?: number | null
          guid: string
          id?: string
          image_url?: string | null
          podcast_id: string
          published_at: string
          search_vector?: unknown
          season_number?: number | null
          title: string
        }
        Update: {
          audio_url?: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          episode_number?: number | null
          guid?: string
          id?: string
          image_url?: string | null
          podcast_id?: string
          published_at?: string
          search_vector?: unknown
          season_number?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_episodes_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_listen_progress: {
        Row: {
          completed: boolean | null
          current_time_seconds: number | null
          duration_seconds: number | null
          episode_id: string
          id: string
          last_listened_at: string | null
          percentage: number | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          current_time_seconds?: number | null
          duration_seconds?: number | null
          episode_id: string
          id?: string
          last_listened_at?: string | null
          percentage?: number | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          current_time_seconds?: number | null
          duration_seconds?: number | null
          episode_id?: string
          id?: string
          last_listened_at?: string | null
          percentage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_listen_progress_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          last_listened_at: string | null
          last_listened_episode_id: string | null
          notify_new_episodes: boolean | null
          podcast_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_listened_at?: string | null
          last_listened_episode_id?: string | null
          notify_new_episodes?: boolean | null
          podcast_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_listened_at?: string | null
          last_listened_episode_id?: string | null
          notify_new_episodes?: boolean | null
          podcast_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_subscriptions_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      podcasts: {
        Row: {
          author: string | null
          categories: string[] | null
          created_at: string | null
          description: string | null
          episode_count: number | null
          feed_url: string
          id: string
          image_url: string | null
          language: string | null
          last_episode_date: string | null
          search_vector: unknown
          title: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          author?: string | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          episode_count?: number | null
          feed_url: string
          id?: string
          image_url?: string | null
          language?: string | null
          last_episode_date?: string | null
          search_vector?: unknown
          title: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          author?: string | null
          categories?: string[] | null
          created_at?: string | null
          description?: string | null
          episode_count?: number | null
          feed_url?: string
          id?: string
          image_url?: string | null
          language?: string | null
          last_episode_date?: string | null
          search_vector?: unknown
          title?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          last_used_at: string | null
          p256dh_key: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      queue_jobs: {
        Row: {
          archival_duration: unknown
          created_at: string
          deadline: string | null
          error: string | null
          fingerprint: string
          id: string
          max_retries: number
          payload: Json
          priority: number
          queue: string
          ran_at: string | null
          retries: number
          run_after: string
          status: Database["public"]["Enums"]["queue_job_status"]
        }
        Insert: {
          archival_duration: unknown
          created_at: string
          deadline?: string | null
          error?: string | null
          fingerprint: string
          id?: string
          max_retries?: number
          payload: Json
          priority?: number
          queue: string
          ran_at?: string | null
          retries?: number
          run_after: string
          status?: Database["public"]["Enums"]["queue_job_status"]
        }
        Update: {
          archival_duration?: unknown
          created_at?: string
          deadline?: string | null
          error?: string | null
          fingerprint?: string
          id?: string
          max_retries?: number
          payload?: Json
          priority?: number
          queue?: string
          ran_at?: string | null
          retries?: number
          run_after?: string
          status?: Database["public"]["Enums"]["queue_job_status"]
        }
        Relationships: []
      }
      radio_station_favorites: {
        Row: {
          created_at: string
          id: string
          station_genre: string | null
          station_id: string
          station_image_url: string | null
          station_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          station_genre?: string | null
          station_id: string
          station_image_url?: string | null
          station_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          station_genre?: string | null
          station_id?: string
          station_image_url?: string | null
          station_name?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          id: string
          ip_address: unknown
          request_count: number | null
          window_start: string
        }
        Insert: {
          action_type: string
          id?: string
          ip_address: unknown
          request_count?: number | null
          window_start: string
        }
        Update: {
          action_type?: string
          id?: string
          ip_address?: unknown
          request_count?: number | null
          window_start?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          current_page: number | null
          file_id: string
          id: string
          last_read_at: string | null
          percentage: number | null
          total_pages: number | null
          user_id: string
        }
        Insert: {
          current_page?: number | null
          file_id: string
          id?: string
          last_read_at?: string | null
          percentage?: number | null
          total_pages?: number | null
          user_id: string
        }
        Update: {
          current_page?: number | null
          file_id?: string
          id?: string
          last_read_at?: string | null
          percentage?: number | null
          total_pages?: number | null
          user_id?: string
        }
        Relationships: []
      }
      torrent_comments: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          downvotes: number
          id: string
          parent_id: string | null
          torrent_id: string
          updated_at: string
          upvotes: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          downvotes?: number
          id?: string
          parent_id?: string | null
          torrent_id: string
          updated_at?: string
          upvotes?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          downvotes?: number
          id?: string
          parent_id?: string | null
          torrent_id?: string
          updated_at?: string
          upvotes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrent_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "torrent_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torrent_comments_torrent_id_fkey"
            columns: ["torrent_id"]
            isOneToOne: false
            referencedRelation: "bt_torrents"
            referencedColumns: ["id"]
          },
        ]
      }
      torrent_contents: {
        Row: {
          content_id: string | null
          content_source: string | null
          content_type: string | null
          created_at: string
          episodes: Json | null
          files_count: number | null
          id: string
          info_hash: string
          languages: Json | null
          leechers: number | null
          published_at: string
          release_group: string | null
          seeders: number | null
          size: number
          tsv: unknown
          updated_at: string
          video_3d: string | null
          video_codec: string | null
          video_modifier: string | null
          video_resolution: string | null
          video_source: string | null
        }
        Insert: {
          content_id?: string | null
          content_source?: string | null
          content_type?: string | null
          created_at: string
          episodes?: Json | null
          files_count?: number | null
          id?: string
          info_hash: string
          languages?: Json | null
          leechers?: number | null
          published_at?: string
          release_group?: string | null
          seeders?: number | null
          size?: number
          tsv?: unknown
          updated_at: string
          video_3d?: string | null
          video_codec?: string | null
          video_modifier?: string | null
          video_resolution?: string | null
          video_source?: string | null
        }
        Update: {
          content_id?: string | null
          content_source?: string | null
          content_type?: string | null
          created_at?: string
          episodes?: Json | null
          files_count?: number | null
          id?: string
          info_hash?: string
          languages?: Json | null
          leechers?: number | null
          published_at?: string
          release_group?: string | null
          seeders?: number | null
          size?: number
          tsv?: unknown
          updated_at?: string
          video_3d?: string | null
          video_codec?: string | null
          video_modifier?: string | null
          video_resolution?: string | null
          video_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torrent_contents_content_source_fkey"
            columns: ["content_source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "torrent_contents_content_type_content_source_content_id_fkey"
            columns: ["content_type", "content_source", "content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["type", "source", "id"]
          },
          {
            foreignKeyName: "torrent_contents_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: false
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
        ]
      }
      torrent_favorites: {
        Row: {
          created_at: string | null
          id: string
          torrent_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          torrent_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          torrent_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrent_favorites_torrent_id_fkey"
            columns: ["torrent_id"]
            isOneToOne: false
            referencedRelation: "bt_torrents"
            referencedColumns: ["id"]
          },
        ]
      }
      torrent_files: {
        Row: {
          created_at: string
          extension: string | null
          index: number
          info_hash: string
          path: string
          size: number
          updated_at: string
        }
        Insert: {
          created_at: string
          extension?: string | null
          index: number
          info_hash: string
          path: string
          size: number
          updated_at: string
        }
        Update: {
          created_at?: string
          extension?: string | null
          index?: number
          info_hash?: string
          path?: string
          size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrent_files_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: false
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
        ]
      }
      torrent_folders: {
        Row: {
          album: string | null
          artist: string | null
          cover_url: string | null
          created_at: string | null
          external_id: string | null
          external_source: string | null
          id: string
          metadata_fetched_at: string | null
          path: string
          torrent_id: string
          updated_at: string | null
          year: number | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          cover_url?: string | null
          created_at?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          metadata_fetched_at?: string | null
          path: string
          torrent_id: string
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          cover_url?: string | null
          created_at?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          metadata_fetched_at?: string | null
          path?: string
          torrent_id?: string
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      torrent_hints: {
        Row: {
          content_id: string | null
          content_source: string | null
          content_type: string
          created_at: string
          episodes: Json | null
          info_hash: string
          languages: Json | null
          release_group: string | null
          release_year: number | null
          title: string | null
          updated_at: string
          video_3d: string | null
          video_codec: string | null
          video_modifier: string | null
          video_resolution: string | null
          video_source: string | null
        }
        Insert: {
          content_id?: string | null
          content_source?: string | null
          content_type: string
          created_at: string
          episodes?: Json | null
          info_hash: string
          languages?: Json | null
          release_group?: string | null
          release_year?: number | null
          title?: string | null
          updated_at: string
          video_3d?: string | null
          video_codec?: string | null
          video_modifier?: string | null
          video_resolution?: string | null
          video_source?: string | null
        }
        Update: {
          content_id?: string | null
          content_source?: string | null
          content_type?: string
          created_at?: string
          episodes?: Json | null
          info_hash?: string
          languages?: Json | null
          release_group?: string | null
          release_year?: number | null
          title?: string | null
          updated_at?: string
          video_3d?: string | null
          video_codec?: string | null
          video_modifier?: string | null
          video_resolution?: string | null
          video_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torrent_hints_content_source_fkey"
            columns: ["content_source"]
            isOneToOne: false
            referencedRelation: "metadata_sources"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "torrent_hints_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: true
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
        ]
      }
      torrent_pieces: {
        Row: {
          created_at: string
          info_hash: string
          piece_length: number
          pieces: string
        }
        Insert: {
          created_at: string
          info_hash: string
          piece_length: number
          pieces: string
        }
        Update: {
          created_at?: string
          info_hash?: string
          piece_length?: number
          pieces?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrent_pieces_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: true
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
        ]
      }
      torrent_sources: {
        Row: {
          created_at: string
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at: string
          key: string
          name: string
          updated_at: string
        }
        Update: {
          created_at?: string
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      torrent_tags: {
        Row: {
          created_at: string
          info_hash: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at: string
          info_hash: string
          name: string
          updated_at: string
        }
        Update: {
          created_at?: string
          info_hash?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrent_tags_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: false
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
        ]
      }
      torrent_votes: {
        Row: {
          created_at: string
          id: string
          torrent_id: string
          updated_at: string
          user_id: string
          vote_value: number
        }
        Insert: {
          created_at?: string
          id?: string
          torrent_id: string
          updated_at?: string
          user_id: string
          vote_value: number
        }
        Update: {
          created_at?: string
          id?: string
          torrent_id?: string
          updated_at?: string
          user_id?: string
          vote_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "torrent_votes_torrent_id_fkey"
            columns: ["torrent_id"]
            isOneToOne: false
            referencedRelation: "bt_torrents"
            referencedColumns: ["id"]
          },
        ]
      }
      torrents: {
        Row: {
          created_at: string
          extension: string | null
          files_count: number | null
          files_status: Database["public"]["Enums"]["FilesStatus"]
          info_hash: string
          name: string
          private: boolean
          size: number
          updated_at: string
        }
        Insert: {
          created_at: string
          extension?: string | null
          files_count?: number | null
          files_status?: Database["public"]["Enums"]["FilesStatus"]
          info_hash: string
          name: string
          private: boolean
          size: number
          updated_at: string
        }
        Update: {
          created_at?: string
          extension?: string | null
          files_count?: number | null
          files_status?: Database["public"]["Enums"]["FilesStatus"]
          info_hash?: string
          name?: string
          private?: boolean
          size?: number
          updated_at?: string
        }
        Relationships: []
      }
      torrents_torrent_sources: {
        Row: {
          created_at: string
          import_id: string | null
          info_hash: string
          leechers: number | null
          published_at: string | null
          seeders: number | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at: string
          import_id?: string | null
          info_hash: string
          leechers?: number | null
          published_at?: string | null
          seeders?: number | null
          source: string
          updated_at: string
        }
        Update: {
          created_at?: string
          import_id?: string | null
          info_hash?: string
          leechers?: number | null
          published_at?: string | null
          seeders?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "torrents_torrent_sources_info_hash_fkey"
            columns: ["info_hash"]
            isOneToOne: false
            referencedRelation: "torrents"
            referencedColumns: ["info_hash"]
          },
          {
            foreignKeyName: "torrents_torrent_sources_source_fkey"
            columns: ["source"]
            isOneToOne: false
            referencedRelation: "torrent_sources"
            referencedColumns: ["key"]
          },
        ]
      }
      user_favorites: {
        Row: {
          created_at: string | null
          file_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          comment_count: number
          created_at: string
          display_name: string | null
          favorite_count: number
          id: string
          is_public: boolean
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          comment_count?: number
          created_at?: string
          display_name?: string | null
          favorite_count?: number
          id?: string
          is_public?: boolean
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          comment_count?: number
          created_at?: string
          display_name?: string | null
          favorite_count?: number
          id?: string
          is_public?: boolean
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          renewal_reminder_1d_sent: boolean | null
          renewal_reminder_3d_sent: boolean | null
          renewal_reminder_7d_sent: boolean | null
          renewal_reminder_sent_at: string | null
          status: string
          subscription_expires_at: string | null
          subscription_started_at: string | null
          tier: string
          trial_expires_at: string | null
          trial_started_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          renewal_reminder_1d_sent?: boolean | null
          renewal_reminder_3d_sent?: boolean | null
          renewal_reminder_7d_sent?: boolean | null
          renewal_reminder_sent_at?: string | null
          status?: string
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          tier?: string
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          renewal_reminder_1d_sent?: boolean | null
          renewal_reminder_3d_sent?: boolean | null
          renewal_reminder_7d_sent?: boolean | null
          renewal_reminder_sent_at?: string | null
          status?: string
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          tier?: string
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      video_metadata: {
        Row: {
          audio_codec: string | null
          bitrate: number | null
          codec: string | null
          codec_detected_at: string | null
          container: string | null
          created_at: string | null
          duration_seconds: number | null
          file_id: string
          framerate: number | null
          height: number | null
          id: string
          needs_transcoding: boolean | null
          search_vector: unknown
          title: string | null
          width: number | null
        }
        Insert: {
          audio_codec?: string | null
          bitrate?: number | null
          codec?: string | null
          codec_detected_at?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id: string
          framerate?: number | null
          height?: number | null
          id?: string
          needs_transcoding?: boolean | null
          search_vector?: unknown
          title?: string | null
          width?: number | null
        }
        Update: {
          audio_codec?: string | null
          bitrate?: number | null
          codec?: string | null
          codec_detected_at?: string | null
          container?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_id?: string
          framerate?: number | null
          height?: number | null
          id?: string
          needs_transcoding?: boolean | null
          search_vector?: unknown
          title?: string | null
          width?: number | null
        }
        Relationships: []
      }
      watch_progress: {
        Row: {
          current_time_seconds: number | null
          duration_seconds: number | null
          file_id: string
          id: string
          last_watched_at: string | null
          percentage: number | null
          user_id: string
        }
        Insert: {
          current_time_seconds?: number | null
          duration_seconds?: number | null
          file_id: string
          id?: string
          last_watched_at?: string | null
          percentage?: number | null
          user_id: string
        }
        Update: {
          current_time_seconds?: number | null
          duration_seconds?: number | null
          file_id?: string
          id?: string
          last_watched_at?: string | null
          percentage?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_family_invitation: {
        Args: { p_invite_code: string; p_user_email: string; p_user_id: string }
        Returns: {
          family_plan_id: string
          message: string
          success: boolean
        }[]
      }
      activate_subscription: {
        Args: { p_duration_months?: number; p_tier: string; p_user_id: string }
        Returns: {
          created_at: string | null
          id: string
          renewal_reminder_1d_sent: boolean | null
          renewal_reminder_3d_sent: boolean | null
          renewal_reminder_7d_sent: boolean | null
          renewal_reminder_sent_at: string | null
          status: string
          subscription_expires_at: string | null
          subscription_started_at: string | null
          tier: string
          trial_expires_at: string | null
          trial_started_at: string | null
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      budgeted_count: {
        Args: { budget: number; query: string }
        Returns: Record<string, unknown>
      }
      can_invite_family_member: {
        Args: { p_family_plan_id: string }
        Returns: boolean
      }
      check_username_available: {
        Args: { check_username: string }
        Returns: boolean
      }
      create_family_plan_for_user: {
        Args: { p_plan_name?: string; p_user_email: string; p_user_id: string }
        Returns: {
          created_at: string | null
          id: string
          owner_id: string
          plan_name: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "family_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dht_check_rate_limit: {
        Args: { p_api_key_id: string; p_limit_per_min: number }
        Returns: boolean
      }
      dht_get_daily_usage: { Args: { p_api_key_id: string }; Returns: number }
      dht_increment_daily_usage: {
        Args: {
          p_api_key_id: string
          p_is_error?: boolean
          p_response_time_ms: number
        }
        Returns: undefined
      }
      expire_old_family_invitations: { Args: never; Returns: number }
      get_active_iptv_subscription: {
        Args: { p_user_id: string }
        Returns: {
          argontv_line_id: number
          days_remaining: number
          expires_at: string
          is_active: boolean
          m3u_download_link: string
          package_key: string
          password: string
          status: string
          subscription_id: string
          username: string
        }[]
      }
      get_family_invitations: {
        Args: { p_family_plan_id: string }
        Returns: {
          created_at: string
          expires_at: string
          invitation_id: string
          invite_code: string
          invitee_email: string
          status: string
        }[]
      }
      get_family_member_count: {
        Args: { p_family_plan_id: string }
        Returns: number
      }
      get_family_members: {
        Args: { p_family_plan_id: string }
        Returns: {
          email: string
          joined_at: string
          member_id: string
          role: string
          user_id: string
        }[]
      }
      get_family_owner_id: { Args: { p_user_id: string }; Returns: string }
      list_torrents_month_page: {
        Args: {
          page_size: number
          start_ts: string
          end_ts: string
          before_ts?: string
          before_id?: string
        }
        Returns: {
          info_hash: string
          name: string
          size: number
          created_at: string
          files_count: number | null
          files_status: string
          extension: string | null
          private: boolean
          updated_at: string
        }[]
      }
      list_torrents_page: {
        Args: {
          page_size: number
          before_ts?: string
          before_id?: string
        }
        Returns: {
          info_hash: string
          name: string
          size: number
          created_at: string
          files_count: number | null
          files_status: string
          extension: string | null
          private: boolean
          updated_at: string
        }[]
      }
      get_subscription_status: {
        Args: { p_user_id: string }
        Returns: {
          days_remaining: number
          expires_at: string
          is_active: boolean
          needs_renewal: boolean
          status: string
          subscription_id: string
          tier: string
        }[]
      }
      get_subscriptions_needing_reminders: {
        Args: { p_days_before: number }
        Returns: {
          days_until_expiry: number
          subscription_expires_at: string
          tier: string
          user_email: string
          user_id: string
        }[]
      }
      get_user_by_username: {
        Args: { lookup_username: string }
        Returns: {
          profile_avatar_url: string
          profile_bio: string
          profile_comment_count: number
          profile_created_at: string
          profile_display_name: string
          profile_favorite_count: number
          profile_id: string
          profile_is_public: boolean
          profile_user_id: string
          profile_username: string
        }[]
      }
      get_user_family_plan: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          family_plan_id: string
          member_count: number
          owner_email: string
          owner_id: string
          plan_name: string
          user_role: string
        }[]
      }
      get_user_podcast_subscriptions: {
        Args: { p_user_id: string }
        Returns: {
          latest_episode_published_at: string
          latest_episode_title: string
          notify_new_episodes: boolean
          podcast_author: string
          podcast_description: string
          podcast_feed_url: string
          podcast_id: string
          podcast_image_url: string
          podcast_title: string
          podcast_website_url: string
          subscribed_at: string
          subscription_id: string
          unlistened_count: number
        }[]
      }
      get_users_to_notify_new_episode: {
        Args: { p_episode_id: string; p_podcast_id: string }
        Returns: {
          auth_key: string
          p256dh_key: string
          push_endpoint: string
          user_id: string
        }[]
      }
      mark_renewal_reminder_sent: {
        Args: { p_days_before: number; p_user_id: string }
        Returns: undefined
      }
      remove_family_member: {
        Args: {
          p_family_plan_id: string
          p_member_id: string
          p_requester_id: string
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      revoke_family_invitation: {
        Args: { p_invitation_id: string; p_requester_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      search_all: {
        Args: {
          media_type?: string
          result_limit?: number
          result_offset?: number
          search_query: string
        }
        Returns: {
          match_type: string
          rank: number
          torrent_created_at: string
          torrent_file_count: number
          torrent_id: string
          torrent_infohash: string
          torrent_leechers: number
          torrent_name: string
          torrent_seeders: number
          torrent_total_size: number
        }[]
      }
      search_files:
        | {
            Args: {
              media_type?: string
              result_limit?: number
              result_offset?: number
              search_query: string
              torrent_uuid?: string
            }
            Returns: {
              file_id: string
              file_index: number
              file_media_category: string
              file_name: string
              file_path: string
              file_size: number
              rank: number
              torrent_clean_title: string
              torrent_cover_url: string
              torrent_id: string
              torrent_infohash: string
              torrent_name: string
              torrent_poster_url: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_media_type?: string
              p_offset?: number
              search_query: string
            }
            Returns: {
              file_extension: string
              file_id: string
              file_index: number
              file_media_type: string
              file_mime_type: string
              file_name: string
              file_path: string
              file_size: number
              piece_end: number
              piece_start: number
              rank: number
              torrent_id: string
              torrent_infohash: string
              torrent_name: string
            }[]
          }
      search_podcasts: {
        Args: {
          result_limit?: number
          result_offset?: number
          search_query: string
        }
        Returns: {
          podcast_author: string
          podcast_description: string
          podcast_episode_count: number
          podcast_feed_url: string
          podcast_id: string
          podcast_image_url: string
          podcast_title: string
          rank: number
        }[]
      }
      search_torrent_files: {
        Args: {
          p_limit?: number
          p_media_type?: string
          p_offset?: number
          p_torrent_id?: string
          search_query: string
        }
        Returns: {
          file_extension: string
          file_id: string
          file_index: number
          file_media_type: string
          file_mime_type: string
          file_name: string
          file_path: string
          file_size: number
          piece_end: number
          piece_start: number
          rank: number
          torrent_id: string
          torrent_infohash: string
          torrent_name: string
        }[]
      }
      search_torrents: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string
          search_query: string
        }
        Returns: {
          rank: number
          torrent_created_at: string
          torrent_file_count: number
          torrent_id: string
          torrent_infohash: string
          torrent_name: string
          torrent_size: number
          torrent_status: string
        }[]
      }
      search_torrents_by_name: {
        Args: {
          media_type?: string
          result_limit?: number
          result_offset?: number
          search_query: string
        }
        Returns: {
          rank: number
          torrent_created_at: string
          torrent_file_count: number
          torrent_id: string
          torrent_infohash: string
          torrent_leechers: number
          torrent_name: string
          torrent_seeders: number
          torrent_total_size: number
        }[]
      }
    }
    Enums: {
      FilesStatus: "no_info" | "single" | "multi" | "over_threshold"
      queue_job_status: "pending" | "processed" | "retry" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      FilesStatus: ["no_info", "single", "multi", "over_threshold"],
      queue_job_status: ["pending", "processed", "retry", "failed"],
    },
  },
} as const
