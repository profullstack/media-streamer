/**
 * Audio Player Utilities
 * 
 * Utility functions for audio format detection, source configuration,
 * and audio player options.
 */

/**
 * Supported audio formats
 */
export type AudioFormat = 
  | 'mp3' 
  | 'flac' 
  | 'wav' 
  | 'ogg' 
  | 'aac' 
  | 'opus' 
  | 'webm' 
  | 'wma' 
  | 'aiff' 
  | 'ape' 
  | 'unknown';

/**
 * Audio source configuration
 */
export interface AudioSource {
  src: string;
  type: string;
  format: AudioFormat;
  requiresTranscoding: boolean;
}

/**
 * File extension to format mapping
 */
const EXTENSION_FORMAT_MAP: Record<string, AudioFormat> = {
  mp3: 'mp3',
  flac: 'flac',
  wav: 'wav',
  ogg: 'ogg',
  oga: 'ogg',
  aac: 'aac',
  m4a: 'aac',
  opus: 'opus',
  weba: 'webm',
  webm: 'webm',
  wma: 'wma',
  aiff: 'aiff',
  aif: 'aiff',
  ape: 'ape',
};

/**
 * Format to MIME type mapping
 */
const FORMAT_MIME_MAP: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  opus: 'audio/opus',
  webm: 'audio/webm',
  wma: 'audio/x-ms-wma',
  aiff: 'audio/aiff',
  ape: 'audio/x-ape',
  unknown: 'application/octet-stream',
};

/**
 * Formats that can be played natively in browsers
 *
 * Note: FLAC is NOT included because iOS Safari does not support it.
 * While desktop browsers (Chrome 56+, Firefox 51+, Safari 11+) support FLAC,
 * we transcode it to MP3 for cross-platform compatibility.
 */
const NATIVE_FORMATS: Set<AudioFormat> = new Set(['mp3', 'wav', 'ogg', 'aac', 'webm', 'opus']);

/**
 * Extract file extension from a path or URL
 * @param path - File path or URL
 * @returns Lowercase extension without the dot
 */
function extractExtension(path: string): string {
  // Remove query parameters and fragments
  const cleanPath = path.split('?')[0].split('#')[0];
  
  // Get the last part after the last dot
  const parts = cleanPath.split('.');
  if (parts.length < 2) {
    return '';
  }
  
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Detect audio format from file path or URL
 * @param path - File path or URL
 * @returns Detected audio format
 */
export function detectAudioFormat(path: string): AudioFormat {
  if (!path) {
    return 'unknown';
  }

  const extension = extractExtension(path);
  
  if (!extension) {
    return 'unknown';
  }

  return EXTENSION_FORMAT_MAP[extension] ?? 'unknown';
}

/**
 * Check if an audio format is natively supported by browsers
 * @param format - Audio format
 * @returns True if the format is natively supported
 */
export function isSupportedAudioFormat(format: AudioFormat): boolean {
  return NATIVE_FORMATS.has(format);
}

/**
 * Get MIME type for an audio format
 * @param format - Audio format
 * @returns MIME type string
 */
export function getAudioMimeType(format: AudioFormat): string {
  return FORMAT_MIME_MAP[format];
}

/**
 * Create an audio source configuration
 * @param src - Source URL
 * @param filename - Original filename for format detection
 * @returns Audio source configuration
 */
export function createAudioSource(src: string, filename: string): AudioSource {
  const format = detectAudioFormat(filename);
  const type = getAudioMimeType(format);
  const requiresTranscoding = !isSupportedAudioFormat(format);

  return {
    src,
    type,
    format,
    requiresTranscoding,
  };
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted duration string (e.g., "3:45" or "1:23:45")
 */
export function formatDuration(seconds: number): string {
  // Handle invalid values
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
