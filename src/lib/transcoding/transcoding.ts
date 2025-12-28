/**
 * Transcoding Service
 *
 * FFmpeg transcoding configuration and command generation for
 * converting unsupported media formats to web-compatible formats.
 */

/**
 * Media type for transcoding
 */
export type MediaType = 'video' | 'audio';

/**
 * Pre-buffer configuration for transcoding
 * Collects this much data before sending to client to prevent buffering
 */
export const TRANSCODE_PRE_BUFFER_BYTES = 2 * 1024 * 1024; // 2MB pre-buffer

/**
 * Pre-buffer timeout in milliseconds
 * Maximum time to wait for pre-buffer before starting playback anyway
 */
export const TRANSCODE_PRE_BUFFER_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Transcoding profile configuration
 */
export interface TranscodeProfile {
  outputFormat: string;
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  preset?: string;
  crf?: number;
  sampleRate?: number;
}

/**
 * Video formats that require transcoding
 * Note: mp4, webm, ogv are natively supported in browsers
 */
const VIDEO_TRANSCODE_FORMATS = new Set(['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts']);

/**
 * Audio formats that require transcoding
 * Note: FLAC is NOT supported on iOS Safari (only macOS Safari 11+ supports it)
 * Note: WAV, OGG, MP3, AAC, M4A are natively supported in browsers
 * We transcode FLAC to MP3 for iOS Safari compatibility
 */
const AUDIO_TRANSCODE_FORMATS = new Set(['wma', 'aiff', 'ape', 'flac']);

/**
 * Default video transcoding profile (to MP4 with H.264)
 */
const DEFAULT_VIDEO_PROFILE: TranscodeProfile = {
  outputFormat: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  videoBitrate: '2000k',
  audioBitrate: '128k',
  preset: 'fast',
  crf: 23,
};

/**
 * Default audio transcoding profile (to MP3)
 */
const DEFAULT_AUDIO_PROFILE: TranscodeProfile = {
  outputFormat: 'mp3',
  audioCodec: 'libmp3lame',
  audioBitrate: '320k',
  sampleRate: 44100,
};

/**
 * Get transcoding profile for a media format
 * @param mediaType - Type of media (video or audio)
 * @param format - Input format (e.g., 'mkv', 'flac')
 * @returns Transcoding profile or null if format doesn't need transcoding
 */
export function getTranscodeProfile(mediaType: MediaType, format: string): TranscodeProfile | null {
  const normalizedFormat = format.toLowerCase();

  if (mediaType === 'video') {
    if (VIDEO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...DEFAULT_VIDEO_PROFILE };
    }
    return null;
  }

  if (mediaType === 'audio') {
    if (AUDIO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...DEFAULT_AUDIO_PROFILE };
    }
    return null;
  }

  return null;
}

/**
 * Build FFmpeg command arguments for transcoding
 * @param inputPath - Path to input file
 * @param outputPath - Path to output file
 * @param profile - Transcoding profile
 * @returns Array of FFmpeg arguments
 */
export function buildFFmpegArgs(
  inputPath: string,
  outputPath: string,
  profile: TranscodeProfile
): string[] {
  const args: string[] = [];

  // Overwrite output file if exists
  args.push('-y');

  // Input file
  args.push('-i', inputPath);

  // Video codec
  if (profile.videoCodec) {
    args.push('-c:v', profile.videoCodec);
  }

  // Audio codec
  if (profile.audioCodec) {
    args.push('-c:a', profile.audioCodec);
  }

  // Video bitrate
  if (profile.videoBitrate) {
    args.push('-b:v', profile.videoBitrate);
  }

  // Audio bitrate
  if (profile.audioBitrate) {
    args.push('-b:a', profile.audioBitrate);
  }

  // Preset (for x264/x265)
  if (profile.preset) {
    args.push('-preset', profile.preset);
  }

  // CRF (Constant Rate Factor for quality)
  if (profile.crf !== undefined) {
    args.push('-crf', String(profile.crf));
  }

  // Sample rate (for audio)
  if (profile.sampleRate) {
    args.push('-ar', String(profile.sampleRate));
  }

  // MP4 specific: move moov atom to beginning for streaming
  if (profile.outputFormat === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  // Output file
  args.push(outputPath);

  return args;
}

/**
 * Get the output format for a given input format
 * @param mediaType - Type of media (video or audio)
 * @param inputFormat - Input format
 * @returns Output format or null if no transcoding needed
 */
export function getOutputFormat(mediaType: MediaType, inputFormat: string): string | null {
  const profile = getTranscodeProfile(mediaType, inputFormat);
  return profile?.outputFormat ?? null;
}

/**
 * Check if transcoding is supported for a format
 * @param mediaType - Type of media (video or audio)
 * @param format - Format to check
 * @returns True if transcoding is supported
 */
export function isTranscodingSupported(mediaType: MediaType, format: string): boolean {
  const normalizedFormat = format.toLowerCase();

  if (mediaType === 'video') {
    return VIDEO_TRANSCODE_FORMATS.has(normalizedFormat);
  }

  if (mediaType === 'audio') {
    return AUDIO_TRANSCODE_FORMATS.has(normalizedFormat);
  }

  return false;
}

/**
 * Transcoding job status
 */
export type TranscodeStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Transcoding job information
 */
export interface TranscodeJob {
  id: string;
  inputPath: string;
  outputPath: string;
  mediaType: MediaType;
  inputFormat: string;
  outputFormat: string;
  status: TranscodeStatus;
  progress: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Transcoding options for the API
 */
export interface TranscodeOptions {
  /** Input file path or URL */
  input: string;
  /** Original filename for format detection */
  filename: string;
  /** Media type */
  mediaType: MediaType;
  /** Custom output path (optional) */
  outputPath?: string;
  /** Custom profile overrides (optional) */
  profileOverrides?: Partial<TranscodeProfile>;
}

/**
 * Generate output filename from input filename
 * @param inputFilename - Original filename
 * @param outputFormat - Target format
 * @returns Output filename
 */
export function generateOutputFilename(inputFilename: string, outputFormat: string): string {
  const lastDotIndex = inputFilename.lastIndexOf('.');
  const baseName = lastDotIndex > 0 ? inputFilename.slice(0, lastDotIndex) : inputFilename;
  return `${baseName}.${outputFormat}`;
}

/**
 * Get estimated transcoding time based on file size and format
 * @param fileSizeBytes - File size in bytes
 * @param mediaType - Type of media
 * @returns Estimated time in seconds
 */
export function estimateTranscodeTime(fileSizeBytes: number, mediaType: MediaType): number {
  // Rough estimates based on typical transcoding speeds
  // These are conservative estimates for a typical server
  const bytesPerSecond = mediaType === 'video'
    ? 500_000  // ~500KB/s for video transcoding
    : 2_000_000; // ~2MB/s for audio transcoding

  return Math.ceil(fileSizeBytes / bytesPerSecond);
}

/**
 * Streaming-optimized video transcoding profile
 * Uses ultrafast preset for real-time streaming
 * Safari/iOS compatible settings (H.264 Main profile, yuv420p)
 */
const STREAMING_VIDEO_PROFILE: TranscodeProfile = {
  outputFormat: 'mp4',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  videoBitrate: '2000k',
  audioBitrate: '128k',
  preset: 'ultrafast', // Critical for real-time streaming
  crf: 23,
};

/**
 * Streaming-optimized audio transcoding profile
 */
const STREAMING_AUDIO_PROFILE: TranscodeProfile = {
  outputFormat: 'mp3',
  audioCodec: 'libmp3lame',
  audioBitrate: '192k', // Slightly lower for faster streaming
  sampleRate: 44100,
};

/**
 * Get streaming-optimized transcoding profile for a media format
 * Uses faster presets suitable for real-time transcoding
 * @param mediaType - Type of media (video or audio)
 * @param format - Input format (e.g., 'mkv', 'flac')
 * @returns Streaming-optimized transcoding profile or null if format doesn't need transcoding
 */
export function getStreamingTranscodeProfile(mediaType: MediaType, format: string): TranscodeProfile | null {
  const normalizedFormat = format.toLowerCase();

  if (mediaType === 'video') {
    if (VIDEO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...STREAMING_VIDEO_PROFILE };
    }
    return null;
  }

  if (mediaType === 'audio') {
    if (AUDIO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...STREAMING_AUDIO_PROFILE };
    }
    return null;
  }

  return null;
}

/**
 * Build FFmpeg arguments for streaming transcoding (pipe input/output)
 *
 * Uses a simplified, proven command for MKV → MP4 transcoding:
 * ffmpeg -i pipe:0 -threads 4 -acodec aac -vcodec libx264 -movflags frag_keyframe+empty_moov -maxrate 2M -bufsize 1M -f mp4 pipe:1
 *
 * @param profile - Transcoding profile
 * @param _inputFormat - Optional input format hint (currently unused, FFmpeg auto-detects)
 * @returns Array of FFmpeg arguments for streaming
 */
export function buildStreamingFFmpegArgs(profile: TranscodeProfile, _inputFormat?: string): string[] {
  const args: string[] = [];

  // Input from stdin (pipe) - FFmpeg auto-detects format
  args.push('-i', 'pipe:0');

  // Use multiple threads for faster transcoding
  args.push('-threads', '4');

  // Audio codec
  if (profile.audioCodec) {
    args.push('-acodec', profile.audioCodec);
  }

  // Video codec
  if (profile.videoCodec) {
    args.push('-vcodec', profile.videoCodec);
  }

  // MP4 specific: use fragmented MP4 for streaming (allows playback before complete)
  // frag_keyframe+empty_moov is critical for streaming - puts moov atom at start
  if (profile.outputFormat === 'mp4') {
    args.push('-movflags', 'frag_keyframe+empty_moov');
    // Rate control for consistent streaming
    args.push('-maxrate', '2M');
    args.push('-bufsize', '1M');
    args.push('-f', 'mp4');
  }

  // MP3 specific
  if (profile.outputFormat === 'mp3') {
    args.push('-f', 'mp3');
    // Audio bitrate for MP3
    if (profile.audioBitrate) {
      args.push('-b:a', profile.audioBitrate);
    }
  }

  // Output to stdout (pipe)
  args.push('pipe:1');

  return args;
}

/**
 * Get the MIME type for transcoded output
 * @param mediaType - Type of media (video or audio)
 * @param inputFormat - Input format
 * @returns MIME type for transcoded output or null if no transcoding needed
 */
export function getTranscodedMimeType(mediaType: MediaType, inputFormat: string): string | null {
  const profile = getStreamingTranscodeProfile(mediaType, inputFormat);
  if (!profile) {
    return null;
  }

  if (profile.outputFormat === 'mp4') {
    return 'video/mp4';
  }
  if (profile.outputFormat === 'mp3') {
    return 'audio/mpeg';
  }

  return null;
}

/**
 * Detect media type from file extension
 * @param filename - File name with extension
 * @returns Media type or null if not a media file
 */
export function detectMediaType(filename: string): MediaType | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  const videoExtensions = new Set(['mp4', 'mkv', 'avi', 'wmv', 'flv', 'mov', 'ts', 'webm', 'ogv', 'm4v']);
  const audioExtensions = new Set(['mp3', 'flac', 'wma', 'aiff', 'ape', 'wav', 'ogg', 'aac', 'm4a']);

  if (videoExtensions.has(ext)) return 'video';
  if (audioExtensions.has(ext)) return 'audio';

  return null;
}

/**
 * Check if a file needs transcoding based on its extension
 * @param filename - File name with extension
 * @returns True if the file needs transcoding for browser playback
 */
export function needsTranscoding(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;

  return VIDEO_TRANSCODE_FORMATS.has(ext) || AUDIO_TRANSCODE_FORMATS.has(ext);
}
