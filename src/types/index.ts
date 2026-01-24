/**
 * Core type definitions for the Media Torrent platform
 */

// Media Categories
export type MediaCategory = 'audio' | 'video' | 'ebook' | 'document' | 'other';

// Content Types for metadata enrichment
export type ContentType = 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other';

// Torrent Types
export interface Torrent {
  id: string;
  infohash: string;
  magnetUri: string;
  name: string;
  /** Clean title for display (without quality indicators, codecs, etc.) */
  cleanTitle: string | null;
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
  /** Director of the movie or TV show (from OMDb) */
  director: string | null;
  /** Main actors/cast of the movie or TV show (comma-separated, from OMDb) */
  actors: string | null;
  /** Genre(s) of the movie or TV show (comma-separated, from OMDb) */
  genre: string | null;
  /** Video codec (e.g., h264, hevc) - detected from primary video file */
  videoCodec: string | null;
  /** Audio codec (e.g., aac, ac3, dts) - detected from primary video file */
  audioCodec: string | null;
  /** Container format (e.g., mp4, mkv) - detected from primary video file */
  container: string | null;
  /** Whether the torrent needs transcoding for browser playback */
  needsTranscoding: boolean | null;
  /** When codec info was detected */
  codecDetectedAt: string | null;
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
  /** Video/audio codec (e.g., h264, hevc, aac, mp3) */
  videoCodec?: string | null;
  /** Audio codec for video files (e.g., aac, ac3, dts) */
  audioCodec?: string | null;
  /** Container format (e.g., mp4, mkv, webm) */
  container?: string | null;
  /** Whether the file needs transcoding for browser playback */
  needsTranscoding?: boolean;
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
  codec: string | null;
  container: string | null;
  needsTranscoding: boolean;
  codecDetectedAt: string | null;
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
  audioCodec: string | null;
  container: string | null;
  bitrate: number | null;
  framerate: number | null;
  needsTranscoding: boolean;
  codecDetectedAt: string | null;
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
    /** Clean title for display (without quality indicators, codecs, etc.) */
    cleanTitle?: string | null;
    /** Poster URL for movies/TV shows */
    posterUrl?: string | null;
    /** Cover URL for music/books */
    coverUrl?: string | null;
    /** Content type (movie, tvshow, music, book, etc.) */
    contentType?: string | null;
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

/**
 * File progress for UI display (unified watch/reading progress)
 */
export interface FileProgress {
  fileId: string;
  percentage: number;
  completed: boolean;
  /** For watch progress (audio/video) */
  currentTimeSeconds?: number;
  durationSeconds?: number;
  lastWatchedAt?: string;
  /** For reading progress (ebooks) */
  currentPage?: number;
  totalPages?: number;
  lastReadAt?: string;
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
