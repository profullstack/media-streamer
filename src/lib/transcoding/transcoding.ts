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
 * Pre-buffer configuration for video transcoding
 * Collects this much data before sending to client to prevent buffering
 * 10MB at 2Mbps = ~40 seconds of video buffer
 */
export const TRANSCODE_PRE_BUFFER_BYTES_VIDEO = 10 * 1024 * 1024; // 10MB pre-buffer for video

/**
 * Pre-buffer configuration for audio transcoding
 * Audio needs less buffer since bitrate is much lower
 */
export const TRANSCODE_PRE_BUFFER_BYTES_AUDIO = 2 * 1024 * 1024; // 2MB pre-buffer for audio

/**
 * Legacy export for backwards compatibility
 * @deprecated Use TRANSCODE_PRE_BUFFER_BYTES_VIDEO or TRANSCODE_PRE_BUFFER_BYTES_AUDIO
 */
export const TRANSCODE_PRE_BUFFER_BYTES = TRANSCODE_PRE_BUFFER_BYTES_VIDEO;

/**
 * Pre-buffer timeout in milliseconds
 * Maximum time to wait for pre-buffer before starting playback anyway
 */
export const TRANSCODE_PRE_BUFFER_TIMEOUT_MS = 60_000; // 60 seconds (increased for video)

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
 * @param forceTranscode - If true, always return a profile even for "supported" formats
 *                         This is used when the client detects codec issues at runtime
 * @returns Streaming-optimized transcoding profile or null if format doesn't need transcoding
 */
export function getStreamingTranscodeProfile(
  mediaType: MediaType,
  format: string,
  forceTranscode = false
): TranscodeProfile | null {
  const normalizedFormat = format.toLowerCase();

  if (mediaType === 'video') {
    // If forceTranscode is true, always return a profile
    // This handles cases where the container is supported (e.g., MP4) but the codec isn't (e.g., HEVC)
    if (forceTranscode || VIDEO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...STREAMING_VIDEO_PROFILE };
    }
    return null;
  }

  if (mediaType === 'audio') {
    if (forceTranscode || AUDIO_TRANSCODE_FORMATS.has(normalizedFormat)) {
      return { ...STREAMING_AUDIO_PROFILE };
    }
    return null;
  }

  return null;
}

/**
 * Build FFmpeg arguments for streaming transcoding (pipe input/output)
 *
 * Uses iOS/Safari-compatible settings for both video and audio transcoding:
 *
 * For MKV → MP4 (video):
 * - H.264 Main profile, level 3.1 (iOS Safari compatible)
 * - yuv420p pixel format (required by iOS)
 * - Fragmented MP4 with default_base_moof (required for iOS Safari)
 *
 * For FLAC → MP3 (audio):
 * - write_xing header for proper duration estimation
 * - ID3v2.3 tags for metadata compatibility
 * - Disabled bit reservoir for consistent frame sizes
 *
 * @param profile - Transcoding profile
 * @param _inputFormat - Optional input format hint (currently unused, FFmpeg auto-detects)
 * @returns Array of FFmpeg arguments for streaming
 */
export function buildStreamingFFmpegArgs(profile: TranscodeProfile, _inputFormat?: string): string[] {
  const args: string[] = [];

  // Input from stdin (pipe) - FFmpeg auto-detects format
  args.push('-i', 'pipe:0');

  // Use 1 thread per transcoding job to support multiple concurrent users
  // With 8 CPUs, this allows up to 8 simultaneous transcoding sessions
  // Each user gets dedicated CPU resources without contention
  args.push('-threads', '1');

  // Audio codec
  if (profile.audioCodec) {
    args.push('-acodec', profile.audioCodec);
  }

  // Video codec
  if (profile.videoCodec) {
    args.push('-vcodec', profile.videoCodec);
  }

  // MP4 specific: iOS/Safari-compatible H.264 settings optimized for real-time streaming
  if (profile.outputFormat === 'mp4') {
    // Use ultrafast preset for real-time transcoding
    // This is critical - without it, encoding can't keep up with playback
    args.push('-preset', 'ultrafast');
    
    // Zero latency tuning for real-time streaming
    // Disables features that add latency (B-frames, lookahead, etc.)
    args.push('-tune', 'zerolatency');
    
    // H.264 Baseline profile for maximum compatibility and faster encoding
    // Baseline is simpler than Main (no B-frames, CABAC) = faster encoding
    // Level 3.1 supports up to 1280x720@30fps which is sufficient
    args.push('-profile:v', 'baseline');
    args.push('-level:v', '3.1');
    
    // Pixel format required by iOS Safari
    args.push('-pix_fmt', 'yuv420p');
    
    // Keyframe every 2 seconds (at 30fps = 60 frames)
    // More frequent keyframes = faster seeking and better streaming
    args.push('-g', '60');
    
    // Disable B-frames for lower latency (baseline profile doesn't use them anyway)
    args.push('-bf', '0');
    
    // Use CRF for quality-based encoding (faster than bitrate targeting)
    // CRF 28 is lower quality but much faster to encode
    args.push('-crf', '28');
    
    // Fragmented MP4 for streaming (allows playback before complete)
    // frag_keyframe+empty_moov puts moov atom at start
    // default_base_moof is REQUIRED for iOS Safari fragmented MP4 playback
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof');
    
    // Rate control for consistent streaming
    // Increased buffer size for smoother output
    args.push('-maxrate', '2M');
    args.push('-bufsize', '4M');
    args.push('-f', 'mp4');
  }

  // MP3 specific: iOS/Safari-compatible settings
  if (profile.outputFormat === 'mp3') {
    // Audio bitrate for MP3
    if (profile.audioBitrate) {
      args.push('-b:a', profile.audioBitrate);
    }
    
    // iOS Safari MP3 compatibility options:
    // 1. write_xing: Writes Xing/LAME header for proper duration estimation
    //    Without this, iOS Safari shows incorrect duration and may abort playback
    args.push('-write_xing', '1');
    
    // 2. id3v2_version: Use ID3v2.3 for maximum compatibility
    //    iOS Safari handles ID3v2.3 better than ID3v2.4
    args.push('-id3v2_version', '3');
    
    // 3. reservoir: Disable bit reservoir for consistent frame sizes
    //    This helps with streaming as each frame is self-contained
    args.push('-reservoir', '0');
    
    args.push('-f', 'mp3');
  }

  // Output to stdout (pipe)
  args.push('pipe:1');

  return args;
}

/**
 * Get the MIME type for transcoded output
 * @param mediaType - Type of media (video or audio)
 * @param inputFormat - Input format
 * @param forceTranscode - If true, always return a MIME type even for "supported" formats
 * @returns MIME type for transcoded output or null if no transcoding needed
 */
export function getTranscodedMimeType(
  mediaType: MediaType,
  inputFormat: string,
  forceTranscode = false
): string | null {
  const profile = getStreamingTranscodeProfile(mediaType, inputFormat, forceTranscode);
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

/**
 * Get the appropriate pre-buffer size for a file based on its media type
 * Video needs more buffer than audio due to higher bitrate
 * @param filename - File name with extension
 * @returns Pre-buffer size in bytes
 */
export function getPreBufferSize(filename: string): number {
  const mediaType = detectMediaType(filename);
  if (mediaType === 'video') {
    return TRANSCODE_PRE_BUFFER_BYTES_VIDEO;
  }
  return TRANSCODE_PRE_BUFFER_BYTES_AUDIO;
}
