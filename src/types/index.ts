/**
 * Core type definitions for the Media Torrent platform
 */

// Media Categories
export type MediaCategory = 'audio' | 'video' | 'ebook' | 'document' | 'other';

// Content Types for metadata enrichment
export type ContentType = 'movie' | 'tvshow' | 'music' | 'book' | 'other';

// Torrent Types
export interface Torrent {
  id: string;
  infohash: string;
  magnetUri: string;
  name: string;
  totalSize: number;
  fileCount: number;
  pieceLength: number;
  /** Number of seeders (peers with complete copies), null if unknown */
  seeders: number | null;
  /** Number of leechers (peers downloading), null if unknown */
  leechers: number | null;
  /** When swarm stats were last updated */
  swarmUpdatedAt: string | null;
  /** Poster URL for movies/TV shows */
  posterUrl: string | null;
  /** Cover art URL for music/books */
  coverUrl: string | null;
  /** Content type (movie, tvshow, music, book, other) */
  contentType: ContentType | null;
  /** Release year */
  year: number | null;
  /** Description from external metadata source */
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TorrentFile {
  id: string;
  torrentId: string;
  fileIndex: number;
  path: string;
  name: string;
  extension: string;
  size: number;
  pieceStart: number;
  pieceEnd: number;
  mediaCategory: MediaCategory;
  mimeType: string;
  createdAt: string;
}

// Metadata Types
export interface AudioMetadata {
  id: string;
  fileId: string;
  artist: string | null;
  album: string | null;
  title: string | null;
  trackNumber: number | null;
  durationSeconds: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  genre: string | null;
  year: number | null;
  createdAt: string;
}

export interface VideoMetadata {
  id: string;
  fileId: string;
  title: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  bitrate: number | null;
  framerate: number | null;
  createdAt: string;
}

export interface EbookMetadata {
  id: string;
  fileId: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  language: string | null;
  pageCount: number | null;
  year: number | null;
  createdAt: string;
}

// Search Types
export interface SearchResult {
  type: 'torrent' | 'file';
  torrent: {
    id: string;
    infohash: string;
    name: string;
  };
  file?: {
    id: string;
    path: string;
    name: string;
    size: number;
    mediaCategory: MediaCategory;
    fileIndex: number;
  };
  metadata?: {
    artist?: string;
    album?: string;
    title?: string;
    author?: string;
  };
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// API Types
export interface MagnetIngestRequest {
  magnetUri: string;
}

export interface MagnetIngestResponse {
  success: boolean;
  torrent?: {
    id: string;
    infohash: string;
    name: string;
    totalSize: number;
    fileCount: number;
  };
  error?: string;
  alreadyExists?: boolean;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

// User Types (for optional auth)
export interface UserFavorite {
  id: string;
  userId: string;
  fileId: string;
  createdAt: string;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  collectionType: 'playlist' | 'watchlist' | 'reading_list' | 'mixed';
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  fileId: string;
  position: number;
  createdAt: string;
}

// Progress Types
export interface ReadingProgress {
  id: string;
  userId: string;
  fileId: string;
  currentPage: number;
  totalPages: number | null;
  percentage: number;
  lastReadAt: string;
}

export interface WatchProgress {
  id: string;
  userId: string;
  fileId: string;
  currentTimeSeconds: number;
  durationSeconds: number | null;
  percentage: number;
  lastWatchedAt: string;
}

// Magnet Parsing Types
export interface ParsedMagnet {
  infohash: string;
  displayName: string | null;
  trackers: string[];
  exactLength: number | null;
}

// WebTorrent Types
export interface TorrentMetadata {
  infohash: string;
  name: string;
  files: TorrentFileInfo[];
  pieceLength: number;
  totalSize: number;
}

export interface TorrentFileInfo {
  name: string;
  path: string;
  length: number;
  offset: number;
}

// Stream Types
export interface StreamRequest {
  infohash: string;
  fileIndex: number;
  range?: {
    start: number;
    end: number;
  };
}

// Rate Limiting Types
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}
