// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  request_id: string;
  took_ms: number;
}

export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'EXPIRED_API_KEY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_PARAMS'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

// Torrent Types
export interface Torrent {
  infohash: string;
  name: string;
  size: number | null;
  size_formatted: string;
  files_count: number;
  category: TorrentCategory | null;
  seeders: number;
  leechers: number;
  discovered_at: string;
  magnet: string;
}

export interface TorrentDetails extends Torrent {
  updated_at: string;
  files: TorrentFile[];
}

export interface TorrentFile {
  path: string;
  size: number;
  size_formatted: string;
}

export type TorrentCategory = 'video' | 'audio' | 'software' | 'ebook' | 'other';

// Search Types
export interface SearchParams {
  q: string;
  limit?: number;
  offset?: number;
  sort?: SortField;
  order?: SortOrder;
  min_size?: number;
  max_size?: number;
  category?: TorrentCategory;
}

export type SortField = 'date' | 'size' | 'seeders' | 'relevance';
export type SortOrder = 'asc' | 'desc';

export interface SearchResults {
  query: string;
  total: number;
  limit: number;
  offset: number;
  results: Torrent[];
}

// API Key Types
export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string | null;
  tier: ApiTier;
  rate_limit_per_min: number;
  daily_limit: number;
  monthly_limit: number | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export type ApiTier = 'free' | 'basic' | 'pro' | 'enterprise';

export interface ApiKeyInfo {
  key_id: string;
  tier: ApiTier;
  requests_today: number;
  requests_limit: number;
  rate_limit: string;
  created_at: string;
  expires_at: string | null;
}

// Stats Types
export interface DhtStats {
  total_torrents: number;
  total_size_bytes: number;
  total_size_formatted: string;
  torrents_24h: number;
  torrents_7d: number;
  torrents_30d: number;
  crawler_status: 'running' | 'stopped' | 'unknown';
  last_indexed_at: string | null;
}

// Health Check Types
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime_seconds: number;
  checks: {
    database: 'ok' | 'error';
    redis?: 'ok' | 'error' | 'disabled';
  };
}

// Context Types (for Hono middleware)
export interface AppVariables {
  requestId: string;
  startTime: number;
  apiKey?: ApiKey;
}

// Database Types
export interface DbTorrent {
  infohash: string;
  name: string;
  size: number | null;
  files_count: number;
  category: string | null;
  seeders: number;
  leechers: number;
  discovered_at: string;
  updated_at: string;
  magnet: string;
  relevance?: number;
}

export interface DbTorrentFile {
  id: string;
  torrent_id: string;
  file_index: number;
  path: string;
  size: number;
}

export interface DbApiKey {
  id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  tier: string;
  rate_limit_per_min: number;
  daily_limit: number;
  monthly_limit: number | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  owner_email: string | null;
  metadata: Record<string, unknown>;
}
