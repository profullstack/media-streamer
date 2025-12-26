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
 */
const VIDEO_TRANSCODE_FORMATS = new Set(['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts']);

/**
 * Audio formats that require transcoding
 */
const AUDIO_TRANSCODE_FORMATS = new Set(['flac', 'wma', 'aiff', 'ape']);

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
