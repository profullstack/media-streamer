/**
 * Trending/Popular Content Service
 *
 * Provides trending and popular content from multiple sources:
 * 1. Our own database (popular torrents by seeder count)
 * 2. TheTVDB API for TV shows and movies
 * 
 * Note: Fanart.tv is an artwork API and doesn't provide trending lists.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Media type for trending content
 */
export type TrendingMediaType = 'movie' | 'tv' | 'music' | 'all';

/**
 * Time window for trending content
 */
export type TrendingTimeWindow = 'day' | 'week' | 'month';

/**
 * Trending item from our database
 */
export interface TrendingItem {
  /** Database ID */
  id: string;
  /** Infohash */
  infohash: string;
  /** Title */
  title: string;
  /** Clean title */
  cleanTitle: string | null;
  /** Media type: movie, tv, or music */
  mediaType: 'movie' | 'tv' | 'music' | 'other';
  /** Release year */
  year: number | null;
  /** Poster URL */
  posterUrl: string | null;
  /** Description */
  description: string | null;
  /** Seeder count */
  seeders: number | null;
  /** Leecher count */
  leechers: number | null;
  /** Total size in bytes */
  totalSize: number;
  /** When it was indexed */
  indexedAt: string;
}

/**
 * Trending result with pagination
 */
export interface TrendingResult {
  /** List of trending items */
  items: TrendingItem[];
  /** Current page */
  page: number;
  /** Total pages */
  totalPages: number;
  /** Total results */
  totalResults: number;
}

/**
 * Map content_type to media type
 */
function mapContentType(contentType: string | null): 'movie' | 'tv' | 'music' | 'other' {
  if (!contentType) return 'other';
  
  switch (contentType.toLowerCase()) {
    case 'movie':
      return 'movie';
    case 'tv':
    case 'tvshow':
    case 'series':
      return 'tv';
    case 'music':
    case 'audio':
      return 'music';
    default:
      return 'other';
  }
}

/**
 * Database row type for torrents
 */
interface TorrentRow {
  id: string;
  infohash: string;
  name: string;
  clean_title: string | null;
  content_type: string | null;
  year: number | null;
  poster_url: string | null;
  description: string | null;
  seeders: number | null;
  leechers: number | null;
  total_size: number;
  indexed_at: string;
}

/**
 * Transform database row to TrendingItem
 */
function transformTorrentRow(row: TorrentRow): TrendingItem {
  return {
    id: row.id,
    infohash: row.infohash,
    title: row.name,
    cleanTitle: row.clean_title,
    mediaType: mapContentType(row.content_type),
    year: row.year,
    posterUrl: row.poster_url,
    description: row.description,
    seeders: row.seeders,
    leechers: row.leechers,
    totalSize: row.total_size,
    indexedAt: row.indexed_at,
  };
}

/**
 * Get Supabase client for server-side operations
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Calculate date threshold for time window
 */
function getDateThreshold(timeWindow: TrendingTimeWindow): Date {
  const now = new Date();
  
  switch (timeWindow) {
    case 'day':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Fetch popular/trending content from our database
 * Sorted by seeder count (popularity indicator)
 * 
 * @param mediaType - Type of media to fetch
 * @param timeWindow - Time window for "trending" (recently indexed)
 * @param page - Page number
 * @param pageSize - Items per page
 * @returns Trending result with items and pagination
 */
export async function fetchPopularContent(
  mediaType: TrendingMediaType = 'all',
  timeWindow: TrendingTimeWindow = 'week',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  try {
    const supabase = getSupabaseClient();
    const dateThreshold = getDateThreshold(timeWindow);
    const offset = (page - 1) * pageSize;
    
    // Build query
    let query = supabase
      .from('torrents')
      .select('id, infohash, name, clean_title, content_type, year, poster_url, description, seeders, leechers, total_size, indexed_at', { count: 'exact' })
      .gte('indexed_at', dateThreshold.toISOString())
      .not('seeders', 'is', null)
      .gt('seeders', 0)
      .order('seeders', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    // Filter by media type if specified
    if (mediaType !== 'all') {
      const contentTypes = mediaType === 'tv' 
        ? ['tv', 'tvshow', 'series']
        : mediaType === 'music'
        ? ['music', 'audio']
        : [mediaType];
      
      query = query.in('content_type', contentTypes);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching popular content:', error);
      return {
        items: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      };
    }
    
    const items = (data as TorrentRow[]).map(transformTorrentRow);
    const totalResults = count ?? 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    
    return {
      items,
      page,
      totalPages,
      totalResults,
    };
  } catch (error) {
    console.error('Error fetching popular content:', error);
    return {
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }
}

/**
 * Fetch popular movies from our database
 */
export async function fetchPopularMovies(
  timeWindow: TrendingTimeWindow = 'week',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  return fetchPopularContent('movie', timeWindow, page, pageSize);
}

/**
 * Fetch popular TV shows from our database
 */
export async function fetchPopularTVShows(
  timeWindow: TrendingTimeWindow = 'week',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  return fetchPopularContent('tv', timeWindow, page, pageSize);
}

/**
 * Fetch popular music from our database
 */
export async function fetchPopularMusic(
  timeWindow: TrendingTimeWindow = 'week',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  return fetchPopularContent('music', timeWindow, page, pageSize);
}

/**
 * Fetch recently added content (newest first)
 */
export async function fetchRecentlyAdded(
  mediaType: TrendingMediaType = 'all',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  try {
    const supabase = getSupabaseClient();
    const offset = (page - 1) * pageSize;
    
    // Build query
    let query = supabase
      .from('torrents')
      .select('id, infohash, name, clean_title, content_type, year, poster_url, description, seeders, leechers, total_size, indexed_at', { count: 'exact' })
      .order('indexed_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    // Filter by media type if specified
    if (mediaType !== 'all') {
      const contentTypes = mediaType === 'tv' 
        ? ['tv', 'tvshow', 'series']
        : mediaType === 'music'
        ? ['music', 'audio']
        : [mediaType];
      
      query = query.in('content_type', contentTypes);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching recently added content:', error);
      return {
        items: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      };
    }
    
    const items = (data as TorrentRow[]).map(transformTorrentRow);
    const totalResults = count ?? 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    
    return {
      items,
      page,
      totalPages,
      totalResults,
    };
  } catch (error) {
    console.error('Error fetching recently added content:', error);
    return {
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }
}

/**
 * Fetch most seeded content (all time)
 */
export async function fetchMostSeeded(
  mediaType: TrendingMediaType = 'all',
  page = 1,
  pageSize = 20
): Promise<TrendingResult> {
  try {
    const supabase = getSupabaseClient();
    const offset = (page - 1) * pageSize;
    
    // Build query
    let query = supabase
      .from('torrents')
      .select('id, infohash, name, clean_title, content_type, year, poster_url, description, seeders, leechers, total_size, indexed_at', { count: 'exact' })
      .not('seeders', 'is', null)
      .gt('seeders', 0)
      .order('seeders', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    // Filter by media type if specified
    if (mediaType !== 'all') {
      const contentTypes = mediaType === 'tv' 
        ? ['tv', 'tvshow', 'series']
        : mediaType === 'music'
        ? ['music', 'audio']
        : [mediaType];
      
      query = query.in('content_type', contentTypes);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('Error fetching most seeded content:', error);
      return {
        items: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      };
    }
    
    const items = (data as TorrentRow[]).map(transformTorrentRow);
    const totalResults = count ?? 0;
    const totalPages = Math.ceil(totalResults / pageSize);
    
    return {
      items,
      page,
      totalPages,
      totalResults,
    };
  } catch (error) {
    console.error('Error fetching most seeded content:', error);
    return {
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }
}
