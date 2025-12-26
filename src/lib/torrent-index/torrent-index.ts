/**
 * Torrent Index Module
 * 
 * Handles magnet URL parsing, validation, and torrent file indexing.
 * This module is responsible for metadata-only operations - no actual
 * torrent content is downloaded.
 */

// ============================================================================
// Types
// ============================================================================

export interface ParsedMagnet {
  infohash: string;
  name: string;
  trackers: string[];
  magnetUri: string;
}

export interface TorrentRecord {
  infohash: string;
  name: string;
  magnet_uri: string;
  total_size: number;
  file_count: number;
  piece_length: number | null;
  created_by: string | null;
  status: 'pending' | 'indexing' | 'ready' | 'error';
  error_message: string | null;
}

export interface TorrentFileRecord {
  torrent_id: string;
  path: string;
  name: string;
  size: number;
  file_index: number;
  piece_start: number | null;
  piece_end: number | null;
  offset_in_first_piece: number;
  extension: string;
  mime_type: string;
  media_type: 'audio' | 'video' | 'ebook' | 'image' | 'archive' | 'other';
  metadata: Record<string, unknown> | null;
}

export interface PieceMapping {
  pieceStart: number;
  pieceEnd: number;
  offsetInFirstPiece: number;
}

export interface TorrentFile {
  path: string;
  length: number;
}

// ============================================================================
// Media Type Detection
// ============================================================================

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus', 'aiff', 'ape', 'alac'
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', 'ts', 'm2ts'
]);

const EBOOK_EXTENSIONS = new Set([
  'pdf', 'epub', 'mobi', 'azw', 'azw3', 'djvu', 'cbr', 'cbz', 'fb2'
]);

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico'
]);

const ARCHIVE_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'
]);

const MIME_TYPES: Record<string, string> = {
  // Audio
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  aiff: 'audio/aiff',
  ape: 'audio/ape',
  
  // Video
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ts: 'video/mp2t',
  m2ts: 'video/mp2t',
  
  // Ebooks
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
  
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  
  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
};

/**
 * Detect media type from file extension
 */
export function detectMediaType(extension: string): TorrentFileRecord['media_type'] {
  const ext = extension.toLowerCase();
  
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (EBOOK_EXTENSIONS.has(ext)) return 'ebook';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  
  return 'other';
}

/**
 * Detect MIME type from file extension
 */
export function detectMimeType(extension: string): string {
  const ext = extension.toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Extract file extension from path or filename
 */
export function getFileExtension(path: string): string {
  const filename = path.split('/').pop() ?? path;
  const lastDot = filename.lastIndexOf('.');
  
  if (lastDot === -1 || lastDot === 0) {
    // No extension or hidden file without extension
    if (filename.startsWith('.') && lastDot === 0) {
      // Hidden file like .gitignore - the part after . is the "extension"
      return filename.slice(1).toLowerCase();
    }
    return '';
  }
  
  return filename.slice(lastDot + 1).toLowerCase();
}

// ============================================================================
// Magnet URI Parsing
// ============================================================================

/**
 * Parse a magnet URI and extract its components
 */
export function parseMagnetUri(magnetUri: string): ParsedMagnet {
  if (!magnetUri.startsWith('magnet:?')) {
    throw new Error('Invalid magnet URI: must start with magnet:?');
  }

  const params = new URLSearchParams(magnetUri.slice(8));
  const xt = params.get('xt');
  
  if (!xt) {
    throw new Error('Invalid magnet URI: missing xt parameter');
  }

  // Extract infohash from xt parameter
  const btihMatch = xt.match(/^urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})$/i);
  if (!btihMatch) {
    throw new Error('Missing infohash in magnet URI');
  }

  let infohash = btihMatch[1];
  
  // Convert base32 to hex if needed
  if (infohash.length === 32) {
    infohash = base32ToHex(infohash);
  }
  
  infohash = infohash.toLowerCase();

  // Get display name
  const dn = params.get('dn');
  const name = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : infohash;

  // Get trackers
  const trackers: string[] = [];
  params.forEach((value, key) => {
    if (key === 'tr') {
      trackers.push(value);
    }
  });

  return {
    infohash,
    name,
    trackers,
    magnetUri,
  };
}

/**
 * Validate a magnet URI
 */
export function validateMagnetUri(magnetUri: string): boolean {
  if (!magnetUri || !magnetUri.startsWith('magnet:?')) {
    return false;
  }

  try {
    const params = new URLSearchParams(magnetUri.slice(8));
    const xt = params.get('xt');
    
    if (!xt) return false;

    // Check for valid infohash (40 hex chars or 32 base32 chars)
    const btihMatch = xt.match(/^urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32}=*)$/i);
    if (!btihMatch) return false;

    // Validate hex infohash length
    const hash = btihMatch[1].replace(/=+$/, '');
    if (hash.length !== 40 && hash.length !== 32) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract infohash from magnet URI
 */
export function extractInfohash(magnetUri: string): string | null {
  try {
    const parsed = parseMagnetUri(magnetUri);
    return parsed.infohash;
  } catch {
    return null;
  }
}

/**
 * Convert base32 encoded string to hex
 */
function base32ToHex(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, '');
  
  let bits = '';
  for (const char of cleanBase32) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  
  return hex;
}

// ============================================================================
// Record Creation
// ============================================================================

/**
 * Create a torrent record from parsed magnet data
 */
export function createTorrentRecord(
  parsed: ParsedMagnet,
  userId: string | null
): TorrentRecord {
  return {
    infohash: parsed.infohash,
    name: parsed.name,
    magnet_uri: parsed.magnetUri,
    total_size: 0,
    file_count: 0,
    piece_length: null,
    created_by: userId,
    status: 'pending',
    error_message: null,
  };
}

/**
 * Create file records from torrent file list
 */
export function createFileRecords(
  torrentId: string,
  files: TorrentFile[],
  pieceLength: number
): TorrentFileRecord[] {
  let currentOffset = 0;
  
  return files.map((file, index) => {
    const extension = getFileExtension(file.path);
    const mediaType = detectMediaType(extension);
    const mimeType = detectMimeType(extension);
    const filename = file.path.split('/').pop() ?? file.path;
    
    const pieceMapping = calculatePieceMapping(currentOffset, file.length, pieceLength);
    currentOffset += file.length;
    
    return {
      torrent_id: torrentId,
      path: file.path,
      name: filename,
      size: file.length,
      file_index: index,
      piece_start: pieceMapping.pieceStart,
      piece_end: pieceMapping.pieceEnd,
      offset_in_first_piece: pieceMapping.offsetInFirstPiece,
      extension,
      mime_type: mimeType,
      media_type: mediaType,
      metadata: null,
    };
  });
}

/**
 * Calculate piece mapping for a file
 */
export function calculatePieceMapping(
  fileOffset: number,
  fileSize: number,
  pieceLength: number
): PieceMapping {
  const pieceStart = Math.floor(fileOffset / pieceLength);
  const pieceEnd = Math.ceil((fileOffset + fileSize) / pieceLength) - 1;
  const offsetInFirstPiece = fileOffset % pieceLength;
  
  return {
    pieceStart,
    pieceEnd: Math.max(pieceStart, pieceEnd),
    offsetInFirstPiece,
  };
}
