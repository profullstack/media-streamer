/**
 * Media Player Utilities
 *
 * Shared types, constants, and helper functions for media player components.
 */

/**
 * Check if a string is a valid UUID v4
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Codec information from the API
 */
export interface CodecInfo {
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  needsTranscoding: boolean | null;
  cached: boolean;
  detectedAt?: string;
  duration?: number;
  bitRate?: number;
  resolution?: string;
}

/**
 * Audio codecs that browsers cannot natively decode.
 * When detected, we need audio-only remux (video copy + audio transcode to AAC).
 */
const INCOMPATIBLE_AUDIO_CODECS = new Set([
  'eac3', 'ec-3', 'ac3', 'ac-3',       // Dolby Digital / Dolby Digital Plus / Atmos
  'truehd', 'mlp',                       // Dolby TrueHD
  'dts', 'dca', 'dts-hd', 'dtshd',      // DTS / DTS-HD
  'pcm_s24le', 'pcm_s32le', 'pcm_f64le', // High-bitdepth PCM (24/32-bit)
  'cook', 'sipr', 'atrac3', 'atrac3p',  // RealAudio / ATRAC
  'wmav1', 'wmav2', 'wmavoice', 'wmapro', // WMA
]);

/**
 * Check if an audio codec requires transcoding for browser playback.
 * Returns true if the codec is not natively supported by browsers.
 */
export function needsAudioTranscode(audioCodec: string | null | undefined): boolean {
  if (!audioCodec) return false;
  return INCOMPATIBLE_AUDIO_CODECS.has(audioCodec.toLowerCase());
}

/**
 * Patterns in torrent filenames that indicate incompatible audio codecs.
 * Used as fallback when FFprobe-based codec detection is unavailable.
 */
const FILENAME_AUDIO_PATTERNS: Array<{ pattern: RegExp; codec: string }> = [
  { pattern: /\bDDP?\d?\.\d\.?Atmos\b/i, codec: 'eac3' },
  { pattern: /\bDD[P+]\d?\.\d\b/i, codec: 'eac3' },        // DDP5.1, DD+5.1
  { pattern: /\bEAC-?3\b/i, codec: 'eac3' },                // EAC3, E-AC3
  { pattern: /\bE-AC-3\b/i, codec: 'eac3' },
  { pattern: /\bAtmos\b/i, codec: 'eac3' },                  // Atmos (always E-AC3+)
  { pattern: /\bTrueHD\b/i, codec: 'truehd' },
  { pattern: /\bDTS[-.]?HD\b/i, codec: 'dts' },              // DTS-HD, DTS.HD
  { pattern: /\bDTS[-.]?MA\b/i, codec: 'dts' },              // DTS-MA (Master Audio)
  { pattern: /\bDTS[-.]?X\b/i, codec: 'dts' },               // DTS:X
  { pattern: /\bDTS\b/i, codec: 'dts' },
  { pattern: /\bAC-?3\b/i, codec: 'ac3' },                   // AC3, AC-3 (Dolby Digital)
  { pattern: /\bDD\d\.\d\b/i, codec: 'ac3' },                // DD5.1 (non-plus = AC3)
  { pattern: /\bFLAC\b/i, codec: 'flac' },                   // FLAC is fine in MKV but not MP4
  { pattern: /\bPCM\b/i, codec: 'pcm_s24le' },
  { pattern: /\bWMA\b/i, codec: 'wmav2' },
];

/**
 * Detect audio codec from filename patterns (release naming conventions).
 * Returns the detected codec string or null if no match.
 * Used as fallback when FFprobe codec detection is unavailable.
 */
export function detectAudioCodecFromFilename(filename: string): string | null {
  for (const { pattern, codec } of FILENAME_AUDIO_PATTERNS) {
    if (pattern.test(filename)) {
      return codec;
    }
  }
  return null;
}

/**
 * Swarm statistics from the API
 */
export interface SwarmStats {
  seeders: number | null;
  leechers: number | null;
  fetchedAt: string;
  trackersResponded: number;
  trackersQueried: number;
}

/**
 * Connection status event from SSE endpoint
 */
export interface ConnectionStatus {
  stage: 'initializing' | 'connecting' | 'searching_peers' | 'downloading_metadata' | 'buffering' | 'ready' | 'error';
  message: string;
  numPeers: number;
  progress: number;
  fileProgress?: number;
  downloadSpeed: number;
  uploadSpeed: number;
  downloaded: number;
  uploaded: number;
  ready: boolean;
  fileReady?: boolean;
  fileIndex?: number;
  timestamp: number;
}

/**
 * Error messages that indicate codec issues requiring transcoding
 */
export const CODEC_ERROR_PATTERNS = [
  'MEDIA_ERR_SRC_NOT_SUPPORTED',
  'MEDIA_ERR_DECODE',
  'NotSupportedError',
  'The media could not be loaded',
  'No compatible source was found',
  'Failed to load because no supported source was found',
  'codec',
  'format',
  'unsupported',
  'decode',
];

/**
 * Check if an error message indicates a codec/format issue
 */
export function isCodecError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();
  return CODEC_ERROR_PATTERNS.some(pattern =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Swarm stats polling interval in milliseconds
 */
export const SWARM_STATS_POLL_INTERVAL = 60000;

/**
 * WebSocket trackers for browser WebTorrent
 */
export const WEBTORRENT_TRACKERS = [
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

/**
 * Extract track info from filename
 */
export function extractTrackInfo(filename: string): { title: string; trackNumber?: number } {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  const trackNumMatch = nameWithoutExt.match(/^(\d{1,3})[\s._-]+(.+)$/);
  if (trackNumMatch) {
    return {
      trackNumber: parseInt(trackNumMatch[1], 10),
      title: trackNumMatch[2].trim(),
    };
  }
  return { title: nameWithoutExt };
}

/**
 * Extract album name from file path
 */
export function extractAlbumFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return undefined;
}

/**
 * Extract artist name from file path
 */
export function extractArtistFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 3) {
    return parts[parts.length - 3];
  }
  return undefined;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format bytes per second to human readable speed
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Format bytes per second to compact speed (for mobile)
 */
export function formatSpeedCompact(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)}B`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)}K`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}M`;
}

/**
 * Format bitrate to human readable string
 */
export function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond < 1000) {
    return `${bitsPerSecond.toFixed(0)} bps`;
  }
  if (bitsPerSecond < 1000000) {
    return `${(bitsPerSecond / 1000).toFixed(0)} Kbps`;
  }
  return `${(bitsPerSecond / 1000000).toFixed(1)} Mbps`;
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
