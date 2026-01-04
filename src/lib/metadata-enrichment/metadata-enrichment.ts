/**
 * Metadata Enrichment Service
 *
 * Automatically fetches metadata (posters, covers, descriptions) from external APIs
 * based on torrent name analysis.
 *
 * Supported sources:
 * - OMDb (movies and TV shows) - provides IMDB IDs
 * - Fanart.tv (posters via IMDB IDs for movies/TV, artist images for music)
 * - MusicBrainz (music)
 * - Open Library (books)
 */

import {
  buildMusicBrainzUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  parseMusicBrainzResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
  fetchArtistImage,
  fetchAlbumCover,
  fetchMoviePosterByImdb,
  fetchOMDbDetailByImdbId,
  type MusicBrainzSearchType,
} from '@/lib/metadata';
import { createLogger } from '@/lib/logger';

const logger = createLogger('metadata-enrichment');

// ============================================================================
// Safe Fetch Helper
// ============================================================================

/**
 * Safely fetch a URL with proper error logging
 * Logs the URL and any error details for debugging
 */
async function safeFetch(
  url: string,
  options?: RequestInit,
  context?: string
): Promise<Response> {
  const contextStr = context ? `[${context}] ` : '';
  
  try {
    logger.debug(`${contextStr}Fetching URL`, { url: url.replace(/apikey=[^&]+/, 'apikey=***') });
    const response = await fetch(url, options);
    
    if (!response.ok) {
      logger.warn(`${contextStr}HTTP error`, {
        url: url.replace(/apikey=[^&]+/, 'apikey=***'),
        status: response.status,
        statusText: response.statusText,
      });
    }
    
    return response;
  } catch (error) {
    // Log the full error details for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCause = error instanceof Error && 'cause' in error ? String(error.cause) : undefined;
    
    logger.error(`${contextStr}Fetch failed`, {
      url: url.replace(/apikey=[^&]+/, 'apikey=***'),
      error: errorMessage,
      cause: errorCause,
      headers: options?.headers ? Object.keys(options.headers) : undefined,
    });
    
    throw error;
  }
}

// ============================================================================
// Types
// ============================================================================

export type ContentType = 'movie' | 'tvshow' | 'music' | 'book' | 'xxx' | 'other';

export interface SearchQuery {
  query: string;
  year?: number;
}

export interface EnrichmentOptions {
  /** OMDb API key (used for both movies and TV shows) */
  omdbApiKey?: string;
  musicbrainzUserAgent?: string;
  /** Fanart.tv API key for posters (movies, TV shows) and artist images (music) */
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
  /** Director name(s) from OMDb */
  director?: string;
  /** Actors/cast from OMDb (comma-separated) */
  actors?: string;
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
    // "Season" followed by a reasonable season number (1-99, not a year like 2024)
    // The number must be 1-2 digits and NOT followed by more digits (to avoid matching years)
    // e.g., "Season.1", "Season 1", "Season.01" but NOT "Season.2024"
    /\bseason[\s.]+([1-9]|[1-9]\d)(?!\d)/i,
    /\bepisode[\s.]*\d+\b/i,
    /\bcomplete[\s.]*series\b/i,
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
  xxx: [
    // Common adult content indicators
    /\b(xxx|porn|adult|nsfw)\b/i,
    // 18+ pattern (escaped plus sign)
    /\b18\+/i,
    // Adult studio names (common patterns)
    /\b(brazzers|bangbros|realitykings|naughtyamerica|pornhub|xvideos|xhamster)\b/i,
    // Adult content categories
    /\b(milf|teen|amateur|lesbian|gay|anal|hardcore|softcore|erotic)\b/i,
    // Adult site rips
    /\b(siterip|site\s*rip)\b.*\b(xxx|adult|porn)\b/i,
    /\b(xxx|adult|porn)\b.*\b(siterip|site\s*rip)\b/i,
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

  // Check XXX first (highest priority - adult content should be flagged immediately)
  for (const pattern of CONTENT_PATTERNS.xxx) {
    if (pattern.test(normalizedName)) {
      return 'xxx';
    }
  }

  // Check TV show (more specific patterns)
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
 * Clean up torrent name for display purposes
 * Less aggressive than cleanTorrentName - keeps year and some formatting
 *
 * @param name - The raw torrent name
 * @returns A cleaned title suitable for display in the UI
 */
export function cleanTorrentNameForDisplay(name: string): string {
  const cleaned = name
    // Remove file extensions first (before replacing dots)
    .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg)$/i, '')
    // Remove website prefixes (www.site.org, site.com, etc.)
    .replace(/^(www\.)?[a-z0-9-]+\.(org|com|net|io|tv|cc|to)\s*[-–—]\s*/i, '')
    // Remove release group at end (pattern: -GROUP at end, typically short alphanumeric)
    .replace(/[-.]([a-z]{2,}[0-9]*|[0-9]+[a-z]+)$/i, (match) => {
      const group = match.slice(1);
      if (group.length <= 10 && /^[a-z0-9]+$/i.test(group)) {
        return '';
      }
      return match;
    })
    // Replace dots and underscores with spaces
    .replace(/[._]/g, ' ')
    // Remove common release group tags in brackets (but keep year in parentheses)
    .replace(/\[[^\]]*\]/g, '')
    // Remove quality indicators
    .replace(/\b(1080p|720p|2160p|4k|bluray|blu-ray|brrip|dvdrip|webrip|web-?dl|hdtv|hdrip|x264|x265|hevc|aac|dts|ac3|atmos|truehd|remux|uhd|hdr|hdr10\+?|dv|dolby\s*vision)\b/gi, '')
    // Remove codec/format indicators
    .replace(/\b(h\s*264|h\s*265|h265|h264|10\s*bit|dd\s*5\s*1|dd\s*2\s*0|ddp\s*5\s*1|ddp\s*2\s*0|5\s*1|7\s*1|2\s*0)\b/gi, '')
    // Remove standalone codec numbers
    .replace(/\b(264|265)\b/gi, '')
    // Remove streaming service names
    .replace(/\b(amzn|amazon|nf|netflix|hulu|dsnp|disney\+?|hmax|hbo\s*max|atvp|apple\s*tv\+?|pbs|starz|starzplay)\b/gi, '')
    // Remove audio format indicators for music
    .replace(/\b(mp3|flac|wav|aac|ogg|lossless|320kbps|v0|v2)\b/gi, '')
    // Remove file size indicators
    .replace(/\b\d+(\.\d+)?\s*(mb|gb|tb)\b/gi, '')
    // Remove release group names at end (after dash)
    .replace(/\s+-\s*[a-z0-9]{2,10}\s*$/i, '')
    // Remove common torrent suffixes
    .replace(/\b(proper|repack|internal|limited|extended|unrated|directors?\s*cut|theatrical|imax|remastered)\b/gi, '')
    // Remove standalone "WEB" that might remain
    .replace(/\bWEB\b/gi, '')
    // Remove standalone "MP4" or other container formats
    .replace(/\b(mp4|mkv|avi|mov)\b/gi, '')
    // Remove stray plus signs (from HDR10+)
    .replace(/\s*\+\s*/g, ' ')
    // Remove standalone "H" only if at word boundary
    .replace(/\bH\b(?=\s|$)/gi, '')
    // Remove stray numbers at the end (like "88" from bitrate)
    .replace(/\s+\d{1,3}\s*$/g, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    // Clean up parentheses with only whitespace or empty
    .replace(/\(\s*\)/g, '')
    .trim();

  return cleaned;
}

/**
 * Clean up torrent name artifacts for search queries
 * This is aggressive cleaning to extract just the title
 *
 * @param name - The raw torrent name
 * @returns A cleaned title suitable for API searches
 */
export function cleanTorrentName(name: string): string {
  let cleaned = name
    // Remove file extensions first (before replacing dots)
    .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg)$/i, '')
    // Remove website prefixes (www.site.org, site.com, etc.)
    .replace(/^(www\.)?[a-z0-9-]+\.(org|com|net|io|tv|cc|to)\s*[-–—]\s*/i, '')
    // Remove release group with dots at end (e.g., MP4-BEN.THE.MEN, H265-RELEASE.GROUP)
    // This pattern matches: codec/format followed by dash and dotted words at the end
    .replace(/\.(mp4|mkv|avi|h264|h265|x264|x265|hevc|avc)-[a-z0-9]+(\.[a-z0-9]+)*$/i, '')
    // Remove release group at end BEFORE replacing dots
    // Only match if preceded by quality/codec indicators (e.g., x264-GROUP, H.264-GROUP)
    .replace(/[-.]([a-z]{2,}[0-9]*|[0-9]+[a-z]+)$/i, (match) => {
      // Don't remove if it looks like part of a title (e.g., ".Shining", ".Moon")
      // Release groups are typically short alphanumeric (FLUX, SPARKS, YTS, etc.)
      const group = match.slice(1); // Remove the leading - or .
      if (group.length <= 10 && /^[a-z0-9]+$/i.test(group)) {
        return '';
      }
      return match;
    })
    // Replace dots and underscores with spaces
    .replace(/[._]/g, ' ')
    // Remove common release group tags in brackets
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // Remove DTS-HD, DTS-HD MA, etc. BEFORE removing DTS (to avoid leaving -HD)
    .replace(/\bDTS-?HD(\s*MA)?\b/gi, '')
    // Remove quality indicators (including WEB-DL, WEB DL variants)
    // Note: After dots become spaces, patterns like "H.264" become "H 264"
    .replace(/\b(1080p|720p|2160p|4k|bluray|blu-ray|brrip|dvdrip|webrip|web-?dl|hdtv|hdrip|x264|x265|hevc|aac|dts|ac3|atmos|truehd|remux|uhd|hdr|hdr10\+?|dv|dolby\s*vision)\b/gi, '')
    // Remove video source indicators (TS=telesync, CAM, HDCAM, etc.)
    .replace(/\b(ts|telesync|cam|hdcam|hdts|dvdscr|screener|scr|r5|r6)\b/gi, '')
    // Remove codec/format indicators (handle both dotted and spaced versions)
    .replace(/\b(h\s*264|h\s*265|h265|h264|10\s*bit|dd\s*5\s*1|dd\s*2\s*0|ddp\s*5\s*1|ddp\s*2\s*0|5\s*1|7\s*1|2\s*0)\b/gi, '')
    // Remove standalone H or numbers that might remain from codec patterns
    .replace(/\b(264|265)\b/gi, '')
    // Remove streaming service names
    .replace(/\b(amzn|amazon|nf|netflix|hulu|dsnp|disney\+?|hmax|hbo\s*max|atvp|apple\s*tv\+?|pbs|starz|starzplay|it|web)\b/gi, '')
    // Remove file size indicators
    .replace(/\b\d+(\.\d+)?\s*(mb|gb|tb)\b/gi, '')
    // Remove release group names at end (after dash, typically short alphanumeric)
    // Be careful not to remove parts of titles like "Spider-Man"
    .replace(/\s+-\s*[a-z0-9]{2,10}\s*$/i, '')
    // Remove common torrent suffixes
    .replace(/\b(complete|proper|repack|internal|limited|extended|unrated|directors?\s*cut|theatrical|imax|remastered)\b/gi, '')
    // Remove language indicators (EN, ENG, etc.)
    .replace(/\b(en|eng|english|multi|dual|latino|spanish|french|german|italian|portuguese|russian|japanese|korean|chinese|hindi|arabic|turkish|polish|dutch|swedish|norwegian|danish|finnish|greek|hebrew|czech|hungarian|romanian|bulgarian|ukrainian|vietnamese|thai|indonesian|malay|filipino|tagalog)\b/gi, '')
    // Remove subtitle indicators
    .replace(/\b(subs?|subtitles?|subbed|dubbed|hardcoded|hc)\b/gi, '')
    // Remove common scene tags
    .replace(/\b(proper|real|rerip|nfofix|dirfix|samplefix|syncfix|readnfo|nuked|internal)\b/gi, '')
    // Remove standalone "WEB" that might remain
    .replace(/\bWEB\b/gi, '')
    // Remove standalone "MP4" or other container formats
    .replace(/\b(mp4|mkv|avi|mov)\b/gi, '')
    // Remove stray plus signs (from HDR10+)
    .replace(/\s*\+\s*/g, ' ')
    // Remove standalone "H" only if at word boundary and followed by space/end
    .replace(/\bH\b(?=\s|$)/gi, '')
    // Remove trailing dashes (with optional whitespace)
    .replace(/\s*-\s*$/g, '')
    // Remove leading dashes (with optional whitespace)
    .replace(/^\s*-\s*/g, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // If the result is too short or empty, try a simpler approach
  // Just take everything before the year
  if (cleaned.length < 3) {
    const yearMatch = name.match(/^(.+?)\s*(19|20)\d{2}/);
    if (yearMatch) {
      cleaned = yearMatch[1].replace(/[._]/g, ' ').trim();
    }
  }

  return cleaned;
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
 * Fetch movie metadata from OMDb, then try Fanart.tv for better poster
 * Uses IMDB ID from OMDb to fetch high-quality posters from Fanart.tv
 * Also fetches description/plot from OMDb detail API
 */
async function fetchMovieMetadata(
  query: string,
  year: number | undefined,
  apiKey: string,
  fanartTvApiKey?: string
): Promise<Partial<EnrichmentResult>> {
  const url = buildOMDbUrl(query, apiKey, year, 'movie');
  
  const response = await safeFetch(url, undefined, 'OMDb-movie');
  if (!response.ok) {
    throw new Error(`OMDb API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseOMDbResponse(data);

  if (results.length === 0) {
    return {};
  }

  const movie = results[0];
  const result: Partial<EnrichmentResult> = {
    posterUrl: movie.posterUrl,
    externalId: movie.id,
    externalSource: 'omdb',
    year: movie.year,
    title: movie.title,
  };

  // Fetch detailed info (including plot/description) using IMDB ID
  if (movie.id) {
    try {
      const detailData = await fetchOMDbDetailByImdbId(movie.id, apiKey, 'short');
      if (detailData) {
        if (detailData.description) result.description = detailData.description;
        if (detailData.director) result.director = detailData.director;
        if (detailData.actors) result.actors = detailData.actors;
      }
    } catch (error) {
      // Log but don't fail - description is optional
      logger.warn('Failed to fetch OMDb movie details', {
        imdbId: movie.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Try to get better poster from Fanart.tv using IMDB ID
  // Fanart.tv provides higher quality posters than OMDb
  if (fanartTvApiKey && movie.id) {
    try {
      const fanartPoster = await fetchMoviePosterByImdb(movie.id, { fanartTvApiKey });
      if (fanartPoster) {
        result.posterUrl = fanartPoster;
      }
    } catch (error) {
      // Log but don't fail - Fanart.tv is optional enhancement
      logger.warn('Failed to fetch Fanart.tv movie poster', {
        imdbId: movie.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Fetch TV show metadata from OMDb (type='series'), then try Fanart.tv for better poster
 * Uses IMDB ID from OMDb to fetch high-quality posters from Fanart.tv
 * Also fetches description/plot from OMDb detail API
 */
async function fetchTVShowMetadata(
  query: string,
  apiKey: string,
  fanartTvApiKey?: string
): Promise<Partial<EnrichmentResult>> {
  // OMDb supports TV shows via type='series'
  const url = buildOMDbUrl(query, apiKey, undefined, 'series');
  
  const response = await safeFetch(url, undefined, 'OMDb-tvshow');

  if (!response.ok) {
    throw new Error(`OMDb API error: ${response.status}`);
  }

  const data = await response.json();
  const results = parseOMDbResponse(data);

  if (results.length === 0) {
    return {};
  }

  const show = results[0];
  const result: Partial<EnrichmentResult> = {
    posterUrl: show.posterUrl,
    externalId: show.id,
    externalSource: 'omdb',
    year: show.year,
    title: show.title,
  };

  // Fetch detailed info (including plot/description) using IMDB ID
  if (show.id) {
    try {
      const detailData = await fetchOMDbDetailByImdbId(show.id, apiKey, 'short');
      if (detailData) {
        if (detailData.description) result.description = detailData.description;
        if (detailData.director) result.director = detailData.director;
        if (detailData.actors) result.actors = detailData.actors;
      }
    } catch (error) {
      // Log but don't fail - description is optional
      logger.warn('Failed to fetch OMDb TV show details', {
        imdbId: show.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Try to get better poster from Fanart.tv using IMDB ID
  // Fanart.tv supports TV shows via IMDB ID as well
  if (fanartTvApiKey && show.id) {
    try {
      const fanartPoster = await fetchMoviePosterByImdb(show.id, { fanartTvApiKey });
      if (fanartPoster) {
        result.posterUrl = fanartPoster;
      }
    } catch (error) {
      // Log but don't fail - Fanart.tv is optional enhancement
      logger.warn('Failed to fetch Fanart.tv TV show poster', {
        imdbId: show.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
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
 * Fetch music metadata from MusicBrainz
 * Uses release-group search for discographies/albums to get better results
 * Fetches album covers and artist images from Fanart.tv
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
  
  const response = await safeFetch(url, {
    headers: {
      'User-Agent': userAgent,
    },
  }, 'MusicBrainz');

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

  // Extract artist name for Fanart.tv lookups
  const artistName = extractArtistName(torrentName) ?? result.artist;

  // For discographies, fetch artist image from Fanart.tv
  // This provides a band photo/artist image for the top-level torrent
  if (isDiscography(torrentName) && fanartTvApiKey && artistName) {
    try {
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
    } catch (error) {
      // Log but don't fail - Fanart.tv is optional enhancement
      logger.warn('Failed to fetch Fanart.tv artist image', {
        artistName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // For single albums (release-groups), fetch album cover from Fanart.tv
  if (searchType === 'release-group' && !isDiscography(torrentName) && fanartTvApiKey && artistName) {
    try {
      // Pass the MusicBrainz release-group ID to get the specific album cover
      const coverUrl = await fetchAlbumCover(artistName, {
        fanartTvApiKey,
        userAgent,
      }, result.id);
      if (coverUrl) {
        enrichmentResult.coverUrl = coverUrl;
      }
    } catch (error) {
      // Log but don't fail - Fanart.tv is optional enhancement
      logger.warn('Failed to fetch Fanart.tv album cover', {
        artistName,
        releaseGroupId: result.id,
        error: error instanceof Error ? error.message : String(error),
      });
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
  
  const response = await safeFetch(url, undefined, 'OpenLibrary');
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

  // Skip enrichment for 'other' and 'xxx' content types
  // XXX content doesn't get external metadata enrichment
  if (contentType === 'other' || contentType === 'xxx') {
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
        const movieData = await fetchMovieMetadata(query, year, options.omdbApiKey, options.fanartTvApiKey);
        Object.assign(result, movieData);
        break;
      }

      case 'tvshow': {
        // TV shows also use OMDb (type='series') - no separate TheTVDB key needed
        if (!options.omdbApiKey) {
          result.error = 'OMDb API key not configured';
          return result;
        }
        const tvData = await fetchTVShowMetadata(query, options.omdbApiKey, options.fanartTvApiKey);
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
