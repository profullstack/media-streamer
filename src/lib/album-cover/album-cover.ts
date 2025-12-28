/**
 * Album Cover Art Utilities
 *
 * Functions for extracting album information from file paths
 * and fetching cover art from external sources.
 */

/**
 * Album information extracted from a file path
 */
export interface AlbumInfo {
  artist: string;
  album: string;
  year?: number;
}

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
];

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

  return undefined;
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
 * Extract album information from a file path
 *
 * Handles common discography structures:
 * - "Artist/Album (Year)/track.flac"
 * - "Artist - Discography/Album (Year)/track.flac"
 * - "Artist/Album [Year]/track.flac"
 *
 * @param filePath - The file path to parse
 * @returns Album info or null if unable to extract
 */
export function extractAlbumInfoFromPath(filePath: string): AlbumInfo | null {
  // Split path into parts
  const parts = filePath.split('/').filter(Boolean);

  // Need at least 3 parts: artist/album/file or discography/album/file
  if (parts.length < 3) {
    return null;
  }

  // Remove the filename (last part)
  const folders = parts.slice(0, -1);

  // Find the album folder (usually the last folder before the file)
  const albumFolder = folders[folders.length - 1];
  const year = extractYearFromName(albumFolder);
  const album = cleanAlbumName(albumFolder);

  // Find the artist
  let artist: string | undefined;

  // Check if any parent folder is a discography folder
  for (let i = folders.length - 2; i >= 0; i--) {
    const folder = folders[i];
    if (isDiscographyFolder(folder)) {
      artist = extractArtistFromDiscographyFolder(folder);
      if (artist) break;
    }
  }

  // If no discography folder found, use the parent of the album folder
  if (!artist && folders.length >= 2) {
    const parentFolder = folders[folders.length - 2];
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
    artist,
    album,
    year,
  };
}

/**
 * Build a search query for album cover art lookup
 *
 * @param artist - Artist name
 * @param album - Album name
 * @returns Search query string
 */
export function buildAlbumSearchQuery(artist: string, album: string): string {
  return `${artist.trim()} ${album.trim()}`;
}
