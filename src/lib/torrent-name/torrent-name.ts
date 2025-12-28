/**
 * Torrent Name Parsing Utilities
 *
 * Functions for extracting metadata from torrent names.
 */

/**
 * Extract artist name from torrent name
 *
 * Common patterns:
 * - "Artist - Album [FLAC]"
 * - "Artist - Album (Year) [FLAC]"
 * - "Artist - Discography [FLAC]"
 *
 * @param name - The torrent name to parse
 * @returns The extracted artist name, or undefined if not found
 */
export function extractArtistFromTorrentName(name: string): string | undefined {
  if (!name) {
    return undefined;
  }

  // Pattern: "Artist - Album" or "Artist - Discography"
  const dashMatch = name.match(/^([^-]+)\s*-\s*/);
  if (dashMatch) {
    // Clean up the artist name
    const artist = dashMatch[1].trim();
    return artist || undefined;
  }

  return undefined;
}
