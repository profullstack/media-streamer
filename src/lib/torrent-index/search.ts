/**
 * Deep File-Level Search Module
 * 
 * Provides search functionality for files within torrents.
 * Uses PostgreSQL full-text search for efficient querying.
 */

import { createServerClient } from '@/lib/supabase';
import type { MediaCategory } from '@/lib/supabase/types';

// ============================================================================
// Types
// ============================================================================

export interface SearchFilesOptions {
  query: string;
  mediaType?: MediaCategory;
  torrentId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchTorrentsOptions {
  query: string;
  status?: 'pending' | 'indexing' | 'ready' | 'error';
  limit?: number;
  offset?: number;
}

export interface FileSearchResult {
  id: string;
  path: string;
  name: string;
  size: number;
  extension: string | null;
  mediaCategory: MediaCategory | null;
  mimeType: string | null;
  fileIndex: number;
  pieceStart: number;
  pieceEnd: number;
  torrentId: string;
  torrentName: string;
  torrentInfohash: string;
  rank?: number;
}

export interface TorrentSearchResult {
  id: string;
  infohash: string;
  name: string;
  totalSize: number;
  fileCount: number;
  status: string;
  createdAt: string;
  rank?: number;
}

export interface SearchFilesResponse {
  files: FileSearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchTorrentsResponse {
  torrents: TorrentSearchResult[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_QUERY_LENGTH = 500;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Characters/patterns to remove from search queries (SQL injection prevention)
const DANGEROUS_CHARS = /[;'"\\`]|--/g;

// ============================================================================
// Query Sanitization
// ============================================================================

/**
 * Sanitize search input to prevent SQL injection and normalize query
 */
export function sanitizeSearchInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    // Remove dangerous characters
    .replace(DANGEROUS_CHARS, '')
    // Trim whitespace
    .trim()
    // Collapse multiple spaces
    .replace(/\s+/g, ' ');

  // Limit query length
  if (sanitized.length > MAX_QUERY_LENGTH) {
    sanitized = sanitized.slice(0, MAX_QUERY_LENGTH);
  }

  return sanitized;
}

/**
 * Build a PostgreSQL tsquery from a search string
 */
export function buildSearchQuery(input: string): string {
  const sanitized = sanitizeSearchInput(input);
  
  if (!sanitized) {
    return '';
  }

  // Split into words and filter empty
  const words = sanitized.split(' ').filter(w => w.length > 0);
  
  if (words.length === 0) {
    return '';
  }

  // Build tsquery with prefix matching for partial searches
  // Each word gets :* for prefix matching, joined with &
  return words.map(word => `${word}:*`).join(' & ');
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search for files within torrents
 * 
 * Searches across:
 * - File path
 * - File name
 * 
 * Supports filtering by:
 * - Media type (audio, video, ebook, etc.)
 * - Specific torrent ID
 */
export async function searchTorrentFiles(
  options: SearchFilesOptions
): Promise<SearchFilesResponse> {
  const {
    query,
    mediaType,
    torrentId,
    limit = DEFAULT_LIMIT,
    offset = 0,
  } = options;

  // Sanitize and validate
  const sanitizedQuery = sanitizeSearchInput(query);
  const effectiveLimit = Math.min(Math.max(limit, 0), MAX_LIMIT);
  const effectiveOffset = Math.max(offset, 0);

  // Return empty for invalid queries
  if (!sanitizedQuery || effectiveLimit === 0) {
    return {
      files: [],
      total: 0,
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  }

  try {
    const supabase = createServerClient();
    
    // Use the search_torrent_files RPC function if available
    // Otherwise fall back to direct query
    const { data, error } = await supabase.rpc('search_torrent_files', {
      search_query: sanitizedQuery,
      p_media_type: mediaType ?? null,
      p_torrent_id: torrentId ?? null,
      p_limit: effectiveLimit,
      p_offset: effectiveOffset,
    });

    if (error) {
      console.error('Search error:', error);
      return {
        files: [],
        total: 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
      };
    }

    // Map results to our type
    const files: FileSearchResult[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.file_id as string,
      path: row.file_path as string,
      name: row.file_name as string,
      size: row.file_size as number,
      extension: row.file_extension as string | null,
      mediaCategory: row.file_media_type as MediaCategory | null,
      mimeType: row.file_mime_type as string | null,
      fileIndex: row.file_index as number,
      pieceStart: row.piece_start as number,
      pieceEnd: row.piece_end as number,
      torrentId: row.torrent_id as string,
      torrentName: row.torrent_name as string,
      torrentInfohash: row.torrent_infohash as string,
      rank: row.rank as number | undefined,
    }));

    return {
      files,
      total: files.length, // RPC doesn't return total count
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      files: [],
      total: 0,
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  }
}

/**
 * Search for torrents by name
 */
export async function searchTorrents(
  options: SearchTorrentsOptions
): Promise<SearchTorrentsResponse> {
  const {
    query,
    status = 'ready',
    limit = DEFAULT_LIMIT,
    offset = 0,
  } = options;

  // Sanitize and validate
  const sanitizedQuery = sanitizeSearchInput(query);
  const effectiveLimit = Math.min(Math.max(limit, 0), MAX_LIMIT);
  const effectiveOffset = Math.max(offset, 0);

  // Return empty for invalid queries
  if (!sanitizedQuery || effectiveLimit === 0) {
    return {
      torrents: [],
      total: 0,
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  }

  try {
    const supabase = createServerClient();
    
    // Use the search_torrents RPC function
    const { data, error } = await supabase.rpc('search_torrents', {
      search_query: sanitizedQuery,
      p_status: status,
      p_limit: effectiveLimit,
      p_offset: effectiveOffset,
    });

    if (error) {
      console.error('Search error:', error);
      return {
        torrents: [],
        total: 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
      };
    }

    // Map results to our type
    const torrents: TorrentSearchResult[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.torrent_id as string,
      infohash: row.torrent_infohash as string,
      name: row.torrent_name as string,
      totalSize: row.torrent_size as number,
      fileCount: row.torrent_file_count as number,
      status: row.torrent_status as string,
      createdAt: row.torrent_created_at as string,
      rank: row.rank as number | undefined,
    }));

    return {
      torrents,
      total: torrents.length,
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      torrents: [],
      total: 0,
      limit: effectiveLimit,
      offset: effectiveOffset,
    };
  }
}

/**
 * Quick search for autocomplete suggestions
 */
export async function getSearchSuggestions(
  query: string,
  limit: number = 10
): Promise<string[]> {
  const sanitizedQuery = sanitizeSearchInput(query);
  
  if (!sanitizedQuery || sanitizedQuery.length < 2) {
    return [];
  }

  try {
    const supabase = createServerClient();
    
    // Get unique file names matching the query
    const { data, error } = await supabase
      .from('torrent_files')
      .select('name')
      .ilike('name', `%${sanitizedQuery}%`)
      .limit(limit);

    if (error) {
      return [];
    }

    // Extract unique names
    const names = new Set<string>();
    for (const row of data ?? []) {
      if (row.name) {
        names.add(row.name);
      }
    }

    return Array.from(names).slice(0, limit);
  } catch {
    return [];
  }
}
