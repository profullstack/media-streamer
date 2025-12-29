/**
 * Metadata Enrichment Service
 *
 * Automatically fetches metadata (posters, covers, descriptions) from external APIs
 * based on torrent name analysis.
 *
 * Supported sources:
 * - OMDb (movies)
 * - TheTVDB (TV shows)
 * - MusicBrainz (music)
 * - Fanart.tv (artist images for discographies)
 * - Open Library (books)
 */

import {
  buildMusicBrainzUrl,
  buildCoverArtArchiveUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  buildTheTVDBUrl,
  parseMusicBrainzResponse,
  parseCoverArtArchiveResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
  parseTheTVDBResponse,
  fetchArtistImage,
  type MusicBrainzSearchType,
} from '@/lib/metadata';

// ============================================================================
// Types
// ============================================================================

export type ContentType = 'movie' | 'tvshow' | 'music' | 'book' | 'other';

export interface SearchQuery {
  query: string;
  year?: number;
}

export interface EnrichmentOptions {
  omdbApiKey?: string;
  thetvdbApiKey?: string;
  musicbrainzUserAgent?: string;
  /** Fanart.tv API key for artist images */
  fanartTvApiKey?: string;
  /** Override the auto-detected content type (useful when content type is known from file analysis) */
  contentTypeOverride?: ContentType;
}

export interface EnrichmentResult {
  contentType: ContentType;
  posterUrl?: string;
  coverUrl?: string;
  /** Artist image URL (for discography collections) */
  artistImageUrl?: string;
  externalId?: string;
  externalSource?: string;
  year?: number;
  description?: string;
  title?: string;
  /** Artist name extracted from torrent */
  artist?: string;
  error?: string;
}

// ============================================================================
// Content Type Detection
// ============================================================================

/**
 * Patterns for detecting content type from torrent name
 */
const CONTENT_PATTERNS = {
  movie: [
    // Year patterns (1900-2099) with quality indicators
    /\b(19|20)\d{2}\b.*\b(1080p|720p|2160p|4k|bluray|brrip|dvdrip|webrip)\b/i,
    // Common movie quality indicators
    /\b(bluray|brrip|dvdrip|webrip|hdrip|cam|ts|screener)\b.*\b(1080p|720p|2160p|4k)\b/i,
    // IMAX, theatrical
    /\b(imax|theatrical|directors.?cut|extended)\b/i,
    // Movie collections/series (but not TV series)
    /\b(trilogy|duology|quadrilogy|pentalogy|hexalogy|saga)\b/i,
    /\bcollection\b.*\b(1080p|720p|2160p|4k|bluray|h\.?264|h\.?265|hevc)\b/i,
    /\bseries\b.*\b(complete|1080p|720p|2160p|4k|bluray)\b/i,
    // Specific movie collection patterns
    /\b(complete|full)\b.*\b(1080p|720p|2160p|4k|bluray)\b/i,
  ],
  tvshow: [
    // Season/Episode patterns - these are definitive TV show indicators
    /\bS\d{1,2}E\d{1,2}\b/i,
    /\bS\d{1,2}\b/i, // S01, S08, etc.
    /\bseason\s*\d+\b/i,
    /\bepisode\s*\d+\b/i,
    /\bcomplete\s*series\b/i,
  ],
  music: [
    // Artist - Album pattern with format in brackets
    /^[^-]+-[^-]+\s*\[(flac|mp3|aac|wav|alac|ogg)\]/i,
    // Album format indicators in brackets
    /\[(flac|mp3\s*\d*|aac|wav|alac|ogg|v0|320|lossless|cd\s*rip|web)\]/i,
    // FLAC without brackets (common torrent format)
    /\bflac\b/i,
    // Various Artists
    /\bvarious\s*artists\b/i,
    // Discography
    /\bdiscography\b/i,
    // Complete works / collection (music-specific)
    /\bcomplete\s*works\b/i,
    /\bcollection\b.*\b(flac|mp3|lossless)\b/i,
    // Studio albums collection
    /\bstudio\s*albums\b/i,
    // Hi-res / lossless indicators
    /\b(24-?bit|hi-?res|lossless)\b/i,
  ],
  book: [
    // Ebook formats
    /\.(epub|mobi|pdf|azw3?|djvu)\b/i,
    /\[(epub|mobi|pdf|azw3?|djvu)\]/i,
    // Author - Title pattern with book format
    /^[^-]+-[^-]+\s*\[(epub|mobi|pdf)\]/i,
  ],
};

/**
 * Detect content type from torrent name
 */
export function detectContentType(name: string): ContentType {
  if (!name || !name.trim()) {
    return 'other';
  }

  const normalizedName = name.trim();

  // Check TV show first (more specific patterns)
  for (const pattern of CONTENT_PATTERNS.tvshow) {
    if (pattern.test(normalizedName)) {
      return 'tvshow';
    }
  }

  // Check music
  for (const pattern of CONTENT_PATTERNS.music) {
    if (pattern.test(normalizedName)) {
      return 'music';
    }
  }

  // Check book
  for (const pattern of CONTENT_PATTERNS.book) {
    if (pattern.test(normalizedName)) {
      return 'book';
    }
  }

  // Check movie (least specific, check last)
  for (const pattern of CONTENT_PATTERNS.movie) {
    if (pattern.test(normalizedName)) {
      return 'movie';
    }
  }

  return 'other';
}

// ============================================================================
// Search Query Extraction
// ============================================================================

/**
 * Clean up torrent name artifacts
 */
function cleanTorrentName(name: string): string {
  return name
    // Replace dots and underscores with spaces
    .replace(/[._]/g, ' ')
    // Remove common release group tags
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // Remove quality indicators (including WEB-DL, WEB DL variants)
    .replace(/\b(1080p|720p|2160p|4k|bluray|brrip|dvdrip|webrip|web-?dl|hdtv|hdrip|x264|x265|hevc|aac|dts|ac3)\b/gi, '')
    // Remove release group names (usually at end after dash)
    .replace(/-[a-z0-9]+$/i, '')
    // Remove standalone "WEB" that might remain
    .replace(/\bWEB\b/gi, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract year from torrent name
 */
function extractYear(name: string): number | undefined {
  // Look for 4-digit year between 1900-2099
  const yearMatches = name.match(/\b(19|20)\d{2}\b/g);
  
  if (!yearMatches || yearMatches.length === 0) {
    return undefined;
  }

  // If multiple years, prefer one that looks like a release year (not part of title)
  // Usually the year appears after the title
  const years = yearMatches.map(y => parseInt(y, 10));
  
  // Filter to reasonable release years (1950-current year + 1)
  const currentYear = new Date().getFullYear();
  const validYears = years.filter(y => y >= 1950 && y <= currentYear + 1);
  
  // Return the last valid year (usually the release year)
  return validYears.length > 0 ? validYears[validYears.length - 1] : undefined;
}

/**
 * Extract search query from torrent name based on content type
 */
export function extractSearchQuery(name: string, contentType: ContentType): SearchQuery {
  let query = cleanTorrentName(name);
  const year = extractYear(name);

  // Remove year from query if found
  if (year) {
    query = query.replace(new RegExp(`\\b${year}\\b`), '').trim();
  }

  // Content-type specific cleaning
  switch (contentType) {
    case 'tvshow':
      // Remove season/episode info
      query = query.replace(/\bS\d{1,2}(E\d{1,2})?\b/gi, '').trim();
      query = query.replace(/\bseason\s*\d+\b/gi, '').trim();
      query = query.replace(/\bepisode\s*\d+\b/gi, '').trim();
      break;

    case 'music':
      // Keep artist - album format if present
      // Already cleaned by cleanTorrentName
      break;

    case 'book':
      // Keep author - title format if present
      break;
  }

  // Truncate very long queries
  if (query.length > 200) {
    query = query.substring(0, 200).trim();
  }

  return { query, year };
}

// ============================================================================
// Metadata Enrichment
// ============================================================================

/**
 * Fetch movie metadata from OMDb
 */
async function fetchMovieMetadata(
  query: string,
  year: number | undefined,
  apiKey: string
): Promise<Partial<EnrichmentResult>> {
  const url = buildOMDbUrl(query, apiKey, year, 'movie');
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OMDb API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseOMDbResponse(data);

  if (results.length === 0) {
    return {};
  }

  const movie = results[0];
  return {
    posterUrl: movie.posterUrl,
    externalId: movie.id,
    externalSource: 'omdb',
    year: movie.year,
    title: movie.title,
  };
}

/**
 * Fetch TV show metadata from TheTVDB
 */
async function fetchTVShowMetadata(
  query: string,
  apiKey: string
): Promise<Partial<EnrichmentResult>> {
  const url = buildTheTVDBUrl(query, 'series', 5);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`TheTVDB API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseTheTVDBResponse(data);

  if (results.length === 0) {
    return {};
  }

  const show = results[0];
  return {
    posterUrl: show.imageUrl,
    externalId: show.id,
    externalSource: 'thetvdb',
    year: show.year,
    title: show.title,
    description: show.overview,
  };
}

/**
 * Check if the torrent name indicates a discography (artist collection, not single album)
 */
function isDiscography(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName.includes('discography') ||
    lowerName.includes('complete works') ||
    lowerName.includes('complete discography') ||
    lowerName.includes('anthology') ||
    lowerName.includes('studio albums') ||
    // Pattern like "Artist - Discography" or "Artist Discography"
    /discography/i.test(name)
  );
}

/**
 * Check if the torrent name indicates a discography or album collection
 */
function isDiscographyOrAlbum(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    isDiscography(name) ||
    lowerName.includes('complete') ||
    lowerName.includes('collection') ||
    // Artist - Album format typically indicates an album
    /^[^-]+-[^-]+/.test(name)
  );
}

/**
 * Extract artist name from torrent name
 * Common patterns:
 * - "Artist - Discography"
 * - "Artist Discography"
 * - "Artist - Album Name"
 * - "Artist - Complete Works"
 */
function extractArtistName(torrentName: string): string | undefined {
  // Clean up the name first
  const cleanName = torrentName
    .replace(/\[.*?\]/g, '') // Remove bracketed content
    .replace(/\(.*?\)/g, '') // Remove parenthetical content
    .trim();

  // Pattern: "Artist - Something"
  const dashMatch = cleanName.match(/^([^-]+)\s*-\s*/);
  if (dashMatch) {
    return dashMatch[1].trim();
  }

  // Pattern: "Artist Discography" or "Artist Complete Works"
  const discographyMatch = cleanName.match(/^(.+?)\s+(discography|complete\s*works|anthology|studio\s*albums)/i);
  if (discographyMatch) {
    return discographyMatch[1].trim();
  }

  return undefined;
}

/**
 * Fetch cover art from Cover Art Archive
 */
async function fetchCoverArt(
  mbid: string,
  type: 'release' | 'release-group',
  userAgent: string
): Promise<string | undefined> {
  const url = buildCoverArtArchiveUrl(mbid, type);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (!response.ok) {
      // 404 is common - no cover art available
      if (response.status === 404) {
        return undefined;
      }
      throw new Error(`Cover Art Archive API error: ${response.status}`);
    }

    const data = await response.json();
    return parseCoverArtArchiveResponse(data);
  } catch {
    // Cover art fetch is optional, don't fail the whole enrichment
    return undefined;
  }
}

/**
 * Fetch music metadata from MusicBrainz
 * Uses release-group search for discographies/albums to get better results and cover art
 * For discographies, also fetches artist image from Fanart.tv
 */
async function fetchMusicMetadata(
  query: string,
  userAgent: string,
  torrentName: string,
  fanartTvApiKey?: string
): Promise<Partial<EnrichmentResult>> {
  // Determine search type based on torrent name
  const searchType: MusicBrainzSearchType = isDiscographyOrAlbum(torrentName)
    ? 'release-group'
    : 'recording';
  
  const url = buildMusicBrainzUrl(searchType, query, 5);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseMusicBrainzResponse(data, searchType);

  if (results.length === 0) {
    return {};
  }

  const result = results[0];
  const enrichmentResult: Partial<EnrichmentResult> = {
    externalId: result.id,
    externalSource: 'musicbrainz',
    year: result.year,
    title: result.title,
    artist: result.artist,
  };

  // For release-groups, try to fetch cover art from Cover Art Archive
  if (searchType === 'release-group') {
    const coverUrl = await fetchCoverArt(result.id, 'release-group', userAgent);
    if (coverUrl) {
      enrichmentResult.coverUrl = coverUrl;
    }
  }

  // For discographies, fetch artist image from Fanart.tv
  // This provides a band photo/artist image for the top-level torrent
  if (isDiscography(torrentName) && fanartTvApiKey) {
    const artistName = extractArtistName(torrentName) ?? result.artist;
    if (artistName) {
      const artistImageUrl = await fetchArtistImage(artistName, {
        fanartTvApiKey,
        userAgent,
      });
      if (artistImageUrl) {
        enrichmentResult.artistImageUrl = artistImageUrl;
        // For discographies, use artist image as the poster (top-level image)
        // since there's no single album cover that represents the whole collection
        enrichmentResult.posterUrl = artistImageUrl;
      }
    }
  }

  return enrichmentResult;
}

/**
 * Fetch book metadata from Open Library
 */
async function fetchBookMetadata(
  query: string
): Promise<Partial<EnrichmentResult>> {
  const url = buildOpenLibraryUrl(query, 5);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Library API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseOpenLibraryResponse(data);

  if (results.length === 0) {
    return {};
  }

  const book = results[0];
  return {
    coverUrl: book.coverUrl,
    externalId: book.id,
    externalSource: 'openlibrary',
    year: book.year,
    title: book.title,
  };
}

/**
 * Enrich torrent metadata by fetching from external APIs
 */
export async function enrichTorrentMetadata(
  torrentName: string,
  options: EnrichmentOptions
): Promise<EnrichmentResult> {
  // Use override if provided, otherwise detect from name
  const contentType = options.contentTypeOverride ?? detectContentType(torrentName);
  const result: EnrichmentResult = { contentType };

  // Skip enrichment for 'other' content type
  if (contentType === 'other') {
    return result;
  }

  const { query, year } = extractSearchQuery(torrentName, contentType);
  result.year = year;

  try {
    switch (contentType) {
      case 'movie': {
        if (!options.omdbApiKey) {
          result.error = 'OMDb API key not configured';
          return result;
        }
        const movieData = await fetchMovieMetadata(query, year, options.omdbApiKey);
        Object.assign(result, movieData);
        break;
      }

      case 'tvshow': {
        if (!options.thetvdbApiKey) {
          result.error = 'TheTVDB API key not configured';
          return result;
        }
        const tvData = await fetchTVShowMetadata(query, options.thetvdbApiKey);
        Object.assign(result, tvData);
        break;
      }

      case 'music': {
        const userAgent = options.musicbrainzUserAgent ?? 'BitTorrented/1.0.0';
        const musicData = await fetchMusicMetadata(query, userAgent, torrentName, options.fanartTvApiKey);
        Object.assign(result, musicData);
        break;
      }

      case 'book': {
        const bookData = await fetchBookMetadata(query);
        Object.assign(result, bookData);
        break;
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}
