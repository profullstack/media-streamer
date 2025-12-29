/**
 * Video Player Utilities
 * 
 * Utility functions for video format detection, source configuration,
 * and Video.js player options.
 */

/**
 * Supported video formats
 */
export type VideoFormat = 
  | 'mp4' 
  | 'webm' 
  | 'mkv' 
  | 'avi' 
  | 'mov' 
  | 'ogg' 
  | 'hls' 
  | 'ts' 
  | 'flv' 
  | 'wmv' 
  | 'unknown';

/**
 * Video source configuration
 */
export interface VideoSource {
  src: string;
  /** Original MIME type of the source file */
  type: string;
  /** MIME type to use for playback (may differ from type if transcoding) */
  playbackType: string;
  format: VideoFormat;
  requiresTranscoding: boolean;
}

/**
 * Video.js player options
 */
export interface PlayerOptions {
  controls?: boolean;
  autoplay?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  fluid?: boolean;
  responsive?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string;
  playbackRates?: number[];
  controlBar?: ControlBarOptions;
  html5?: Html5Options;
}

/**
 * Control bar configuration
 */
export interface ControlBarOptions {
  pictureInPictureToggle?: boolean;
  fullscreenToggle?: boolean;
  volumePanel?: boolean;
  playToggle?: boolean;
  currentTimeDisplay?: boolean;
  timeDivider?: boolean;
  durationDisplay?: boolean;
  progressControl?: boolean;
  remainingTimeDisplay?: boolean;
}

/**
 * HTML5 video options
 */
export interface Html5Options {
  vhs?: {
    overrideNative?: boolean;
    enableLowInitialPlaylist?: boolean;
    smoothQualityChange?: boolean;
    fastQualityChange?: boolean;
  };
  nativeVideoTracks?: boolean;
  nativeAudioTracks?: boolean;
  nativeTextTracks?: boolean;
}

/**
 * File extension to format mapping
 */
const EXTENSION_FORMAT_MAP: Record<string, VideoFormat> = {
  mp4: 'mp4',
  m4v: 'mp4',
  webm: 'webm',
  mkv: 'mkv',
  avi: 'avi',
  mov: 'mov',
  ogg: 'ogg',
  ogv: 'ogg',
  m3u8: 'hls',
  ts: 'ts',
  flv: 'flv',
  wmv: 'wmv',
};

/**
 * Format to MIME type mapping
 */
const FORMAT_MIME_MAP: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  ogg: 'video/ogg',
  hls: 'application/x-mpegURL',
  ts: 'video/mp2t',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  unknown: 'application/octet-stream',
};

/**
 * Formats that can be played natively in browsers
 */
const NATIVE_FORMATS: Set<VideoFormat> = new Set(['mp4', 'webm', 'ogg', 'hls']);

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
 * Detect video format from file path or URL
 * @param path - File path or URL
 * @returns Detected video format
 */
export function detectVideoFormat(path: string): VideoFormat {
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
 * Check if a source is an HLS stream
 * @param path - File path or URL
 * @returns True if the source is HLS
 */
export function isHlsSource(path: string): boolean {
  return detectVideoFormat(path) === 'hls';
}

/**
 * Check if a video format is natively supported by browsers
 * @param format - Video format
 * @returns True if the format is natively supported
 */
export function isSupportedVideoFormat(format: VideoFormat): boolean {
  return NATIVE_FORMATS.has(format);
}

/**
 * Get MIME type for a video format
 * @param format - Video format
 * @returns MIME type string
 */
export function getVideoMimeType(format: VideoFormat): string {
  return FORMAT_MIME_MAP[format];
}

/**
 * Check if a URL has transcoding enabled via query parameter
 * @param url - Source URL to check
 * @returns True if transcode=auto is in the URL
 */
function hasTranscodeParam(url: string): boolean {
  try {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('transcode') === 'auto';
  } catch {
    // If URL parsing fails, check with regex
    return /[?&]transcode=auto(&|$)/.test(url);
  }
}

/**
 * Create a video source configuration
 * @param src - Source URL
 * @param filename - Original filename for format detection
 * @returns Video source configuration
 */
export function createVideoSource(src: string, filename: string): VideoSource {
  const format = detectVideoFormat(filename);
  const type = getVideoMimeType(format);
  
  // Check if transcoding is required based on format OR if explicitly requested via URL
  // The URL parameter is used when we detect codec errors at runtime and retry with transcoding
  const formatRequiresTranscoding = !isSupportedVideoFormat(format);
  const urlRequestsTranscoding = hasTranscodeParam(src);
  const requiresTranscoding = formatRequiresTranscoding || urlRequestsTranscoding;
  
  // When transcoding is required, the server outputs MP4
  // The player needs to know the actual playback MIME type
  const playbackType = requiresTranscoding ? 'video/mp4' : type;

  return {
    src,
    type,
    playbackType,
    format,
    requiresTranscoding,
  };
}

/**
 * Default control bar options
 */
const DEFAULT_CONTROL_BAR: ControlBarOptions = {
  pictureInPictureToggle: true,
  fullscreenToggle: true,
  volumePanel: true,
  playToggle: true,
  currentTimeDisplay: true,
  timeDivider: true,
  durationDisplay: true,
  progressControl: true,
  remainingTimeDisplay: false,
};

/**
 * Default HTML5 options for HLS support
 */
const DEFAULT_HTML5_OPTIONS: Html5Options = {
  vhs: {
    overrideNative: true,
    enableLowInitialPlaylist: true,
    smoothQualityChange: true,
    fastQualityChange: true,
  },
  nativeVideoTracks: false,
  nativeAudioTracks: false,
  nativeTextTracks: false,
};

/**
 * Get default Video.js player options
 * @param overrides - Options to override defaults
 * @returns Complete player options
 */
export function getDefaultPlayerOptions(overrides?: Partial<PlayerOptions>): PlayerOptions {
  const defaultOptions: PlayerOptions = {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fluid: true,
    responsive: true,
    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
    controlBar: { ...DEFAULT_CONTROL_BAR },
    html5: { ...DEFAULT_HTML5_OPTIONS },
  };

  if (!overrides) {
    return defaultOptions;
  }

  // Merge control bar options
  const controlBar = overrides.controlBar
    ? { ...DEFAULT_CONTROL_BAR, ...overrides.controlBar }
    : defaultOptions.controlBar;

  // Merge HTML5 options
  const html5 = overrides.html5
    ? { 
        ...DEFAULT_HTML5_OPTIONS, 
        ...overrides.html5,
        vhs: overrides.html5.vhs 
          ? { ...DEFAULT_HTML5_OPTIONS.vhs, ...overrides.html5.vhs }
          : DEFAULT_HTML5_OPTIONS.vhs,
      }
    : defaultOptions.html5;

  return {
    ...defaultOptions,
    ...overrides,
    controlBar,
    html5,
  };
}
