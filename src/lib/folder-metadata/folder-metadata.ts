/**
 * Folder Metadata Module
 *
 * Extracts and enriches folder-level metadata for discographies
 * and multi-album torrents. Each album folder can have its own
 * cover art fetched from MusicBrainz/Cover Art Archive.
 */

import {
  buildMusicBrainzUrl,
  buildCoverArtArchiveUrl,
  parseMusicBrainzResponse,
  parseCoverArtArchiveResponse,
} from '@/lib/metadata';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents an album folder within a torrent
 */
export interface AlbumFolder {
  /** Full path to the folder (relative to torrent root) */
  path: string;
  /** Artist name extracted from folder structure */
  artist: string;
  /** Album name extracted from folder name */
  album: string;
  /** Release year if found in folder name */
  year?: number;
}

/**
 * File with path information
 */
export interface FileWithPath {
  path: string;
}

/**
 * Options for folder enrichment
 */
export interface FolderEnrichmentOptions {
  musicbrainzUserAgent?: string;
}

/**
 * Result of folder enrichment
 */
export interface FolderEnrichmentResult {
  coverUrl?: string;
  externalId?: string;
  externalSource?: string;
  year?: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Format tags to remove from album names
 */
const FORMAT_TAGS = [
  'FLAC',
  'MP3',
  'AAC',
  'WAV',
  'ALAC',
  'OGG',
  'V0',
  '320',
  'LOSSLESS',
  'CD',
  'WEB',
  '24-96',
  '24-48',
  '16-44',
  '24BIT',
  '16BIT',
  'HI-RES',
  'HIRES',
  'PMEDIA',
];

/**
 * Patterns that indicate a CD/Disc subfolder (not an album)
 */
const CD_FOLDER_PATTERNS = [
  /^cd\s*\d+$/i,
  /^disc\s*\d+$/i,
  /^disk\s*\d+$/i,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a folder name is a CD/Disc subfolder
 */
function isCdSubfolder(name: string): boolean {
  return CD_FOLDER_PATTERNS.some(pattern => pattern.test(name.trim()));
}

/**
 * Clean album name by removing format tags and quality indicators
 */
function cleanAlbumName(name: string): string {
  let cleaned = name;

  // Remove format tags in brackets
  for (const tag of FORMAT_TAGS) {
    const bracketPattern = new RegExp(`\\s*\\[${tag}\\]\\s*`, 'gi');
    cleaned = cleaned.replace(bracketPattern, '');
  }

  // Remove year in parentheses or brackets (we extract it separately)
  cleaned = cleaned.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '');
  cleaned = cleaned.replace(/\s*\[(?:19|20)\d{2}\]\s*$/, '');

  return cleaned.trim();
}

/**
 * Extract year from a folder name
 */
function extractYearFromName(name: string): number | undefined {
  // Look for year in parentheses: "Album (2020)"
  const parenMatch = name.match(/\((\d{4})\)/);
  if (parenMatch) {
    const year = parseInt(parenMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      return year;
    }
  }

  // Look for year in brackets: "Album [2020]"
  const bracketMatch = name.match(/\[(\d{4})\]/);
  if (bracketMatch) {
    const year = parseInt(bracketMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      return year;
    }
  }

  // Look for year at start: "1983 - Kill Em All"
  const startMatch = name.match(/^(\d{4})\s*-\s*/);
  if (startMatch) {
    const year = parseInt(startMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      return year;
    }
  }

  return undefined;
}

/**
 * Clean album name that starts with year
 */
function cleanYearPrefixedAlbum(name: string): string {
  // Remove "1983 - " prefix
  return name.replace(/^\d{4}\s*-\s*/, '').trim();
}

/**
 * Check if a folder name looks like a discography indicator
 */
function isDiscographyFolder(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    lowerName.includes('discography') ||
    lowerName.includes('complete') ||
    lowerName.includes('collection') ||
    lowerName.includes('anthology') ||
    lowerName.includes('studio albums')
  );
}

/**
 * Extract artist name from a discography folder name
 * e.g., "Metallica - Discography (1983-2016)" -> "Metallica"
 */
function extractArtistFromDiscographyFolder(name: string): string | undefined {
  // Pattern: "Artist - Discography..."
  const dashMatch = name.match(/^([^-]+)\s*-\s*/);
  if (dashMatch) {
    return dashMatch[1].trim();
  }
  return undefined;
}

/**
 * Get the album folder path from a file path
 * Handles CD/Disc subfolders by going up one level
 */
function getAlbumFolderPath(filePath: string): string | null {
  const parts = filePath.split('/').filter(Boolean);

  // Need at least 3 parts: artist/album/file or discography/album/file
  if (parts.length < 3) {
    return null;
  }

  // Remove the filename (last part)
  const folders = parts.slice(0, -1);

  // Check if the last folder is a CD/Disc subfolder
  const lastFolder = folders[folders.length - 1];
  if (isCdSubfolder(lastFolder) && folders.length >= 2) {
    // Go up one level to get the actual album folder
    return folders.slice(0, -1).join('/');
  }

  return folders.join('/');
}

/**
 * Extract album info from a folder path
 */
function extractAlbumInfoFromFolderPath(folderPath: string): AlbumFolder | null {
  const parts = folderPath.split('/').filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  // The album folder is the last part
  const albumFolder = parts[parts.length - 1];
  let year = extractYearFromName(albumFolder);
  let album = cleanAlbumName(albumFolder);

  // Handle "1983 - Kill Em All" format
  if (!year && /^\d{4}\s*-\s*/.test(albumFolder)) {
    year = extractYearFromName(albumFolder.match(/^(\d{4})/)?.[0] ?? '');
    album = cleanYearPrefixedAlbum(albumFolder);
  }

  // Find the artist
  let artist: string | undefined;

  // Check if any parent folder is a discography folder
  for (let i = parts.length - 2; i >= 0; i--) {
    const folder = parts[i];
    if (isDiscographyFolder(folder)) {
      artist = extractArtistFromDiscographyFolder(folder);
      if (artist) break;
    }
  }

  // If no discography folder found, use the parent of the album folder
  if (!artist && parts.length >= 2) {
    const parentFolder = parts[parts.length - 2];
    // Skip if parent is also a discography folder
    if (!isDiscographyFolder(parentFolder)) {
      artist = parentFolder;
    } else {
      artist = extractArtistFromDiscographyFolder(parentFolder);
    }
  }

  if (!artist || !album) {
    return null;
  }

  return {
    path: folderPath,
    artist,
    album,
    year,
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Extract unique album folders from a list of file paths
 *
 * @param files - Array of files with path property
 * @returns Array of unique album folders with extracted metadata
 */
export function extractAlbumFolders(files: FileWithPath[]): AlbumFolder[] {
  const folderMap = new Map<string, AlbumFolder>();

  for (const file of files) {
    const folderPath = getAlbumFolderPath(file.path);
    if (!folderPath) continue;

    // Skip if we already processed this folder
    if (folderMap.has(folderPath)) continue;

    const albumInfo = extractAlbumInfoFromFolderPath(folderPath);
    if (albumInfo) {
      folderMap.set(folderPath, albumInfo);
    }
  }

  return Array.from(folderMap.values());
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
 * Enrich an album folder with cover art from MusicBrainz
 *
 * @param folder - Album folder to enrich
 * @param options - Enrichment options
 * @returns Enrichment result with cover URL if found
 */
export async function enrichAlbumFolder(
  folder: AlbumFolder,
  options: FolderEnrichmentOptions
): Promise<FolderEnrichmentResult> {
  const userAgent = options.musicbrainzUserAgent ?? 'BitTorrented/1.0.0';

  try {
    // Build search query
    let query = `${folder.artist} ${folder.album}`;
    if (folder.year) {
      query += ` ${folder.year}`;
    }

    // Search MusicBrainz for release-group
    const url = buildMusicBrainzUrl('release-group', query, 5);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }

    const data = await response.json();
    const results = parseMusicBrainzResponse(data, 'release-group');

    if (results.length === 0) {
      return {};
    }

    const result = results[0];
    const enrichmentResult: FolderEnrichmentResult = {
      externalId: result.id,
      externalSource: 'musicbrainz',
      year: result.year,
    };

    // Fetch cover art from Cover Art Archive
    const coverUrl = await fetchCoverArt(result.id, 'release-group', userAgent);
    if (coverUrl) {
      enrichmentResult.coverUrl = coverUrl;
    }

    return enrichmentResult;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
