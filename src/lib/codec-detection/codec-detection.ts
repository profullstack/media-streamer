/**
 * Codec Detection Service
 * 
 * Uses FFmpeg/FFprobe to detect video and audio codecs from streams or files.
 * This enables the server to determine if transcoding is needed before streaming.
 */

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

/**
 * Browser-compatible video codecs
 * Note: HEVC/H.265 has limited browser support (Safari only with hardware)
 */
export const BROWSER_COMPATIBLE_VIDEO_CODECS = new Set([
  'h264',
  'avc1',  // H.264 alias
  'vp8',
  'vp9',
  'av1',
  'theora',
]);

/**
 * Browser-compatible audio codecs
 */
export const BROWSER_COMPATIBLE_AUDIO_CODECS = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
  'pcm_s16le',
  'pcm_s24le',
  'pcm_f32le',
]);

/**
 * Stream information from FFprobe
 */
export interface StreamInfo {
  codecType: 'video' | 'audio' | 'subtitle' | 'data';
  codecName: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  profile?: string;
  level?: number;
}

/**
 * Complete codec information for a media file
 */
export interface CodecInfo {
  videoCodec?: string;
  audioCodec?: string;
  container: string;
  duration?: number;
  bitRate?: number;
  streams: StreamInfo[];
  needsTranscoding?: boolean;
}

/**
 * FFprobe JSON output format
 */
interface FFprobeOutput {
  format: {
    format_name: string;
    duration?: string;
    bit_rate?: string;
  };
  streams: Array<{
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    sample_rate?: string;
    channels?: number;
    bit_rate?: string;
    profile?: string;
    level?: number;
  }>;
}

/**
 * Check if a codec is browser-compatible
 * @param codecName - The codec name from FFprobe
 * @param type - 'video' or 'audio'
 * @returns true if the codec is browser-compatible
 */
export function isCodecBrowserCompatible(
  codecName: string,
  type: 'video' | 'audio'
): boolean {
  const normalizedCodec = codecName.toLowerCase();
  
  if (type === 'video') {
    return BROWSER_COMPATIBLE_VIDEO_CODECS.has(normalizedCodec);
  }
  
  return BROWSER_COMPATIBLE_AUDIO_CODECS.has(normalizedCodec);
}

/**
 * Determine if a media file needs transcoding based on its codecs
 * @param codecInfo - The codec information
 * @returns true if transcoding is needed
 */
export function needsTranscoding(codecInfo: CodecInfo): boolean {
  // Check video codec
  if (codecInfo.videoCodec) {
    if (!isCodecBrowserCompatible(codecInfo.videoCodec, 'video')) {
      return true;
    }
  }
  
  // Check audio codec
  if (codecInfo.audioCodec) {
    if (!isCodecBrowserCompatible(codecInfo.audioCodec, 'audio')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Parse FFprobe JSON output into CodecInfo
 * @param output - FFprobe JSON output
 * @returns Parsed codec information
 */
function parseFFprobeOutput(output: FFprobeOutput): CodecInfo {
  const streams: StreamInfo[] = output.streams.map((stream) => ({
    codecType: stream.codec_type as StreamInfo['codecType'],
    codecName: stream.codec_name,
    width: stream.width,
    height: stream.height,
    sampleRate: stream.sample_rate ? parseInt(stream.sample_rate, 10) : undefined,
    channels: stream.channels,
    bitRate: stream.bit_rate ? parseInt(stream.bit_rate, 10) : undefined,
    profile: stream.profile,
    level: stream.level,
  }));

  const videoStream = streams.find((s) => s.codecType === 'video');
  const audioStream = streams.find((s) => s.codecType === 'audio');

  const codecInfo: CodecInfo = {
    videoCodec: videoStream?.codecName,
    audioCodec: audioStream?.codecName,
    container: output.format.format_name,
    duration: output.format.duration ? parseFloat(output.format.duration) : undefined,
    bitRate: output.format.bit_rate ? parseInt(output.format.bit_rate, 10) : undefined,
    streams,
  };

  codecInfo.needsTranscoding = needsTranscoding(codecInfo);

  return codecInfo;
}

/**
 * Detect codec information from a readable stream
 * Uses FFprobe to analyze the first portion of the stream
 * @param inputStream - The input stream to analyze
 * @param maxBytes - Maximum bytes to read (default 10MB)
 * @returns Promise resolving to codec information
 */
export async function detectCodecFromStream(
  inputStream: Readable,
  maxBytes = 10 * 1024 * 1024
): Promise<CodecInfo> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-i', 'pipe:0',
    ]);

    let stdout = '';
    let stderr = '';
    let bytesWritten = 0;

    ffprobe.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const output = JSON.parse(stdout) as FFprobeOutput;
        resolve(parseFFprobeOutput(output));
      } catch (error) {
        reject(new Error(`Failed to parse FFprobe output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    // Pipe input stream to ffprobe, limiting bytes
    inputStream.on('data', (chunk: Buffer) => {
      if (bytesWritten < maxBytes) {
        const remaining = maxBytes - bytesWritten;
        const toWrite = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
        ffprobe.stdin.write(toWrite);
        bytesWritten += toWrite.length;
        
        if (bytesWritten >= maxBytes) {
          ffprobe.stdin.end();
        }
      }
    });

    inputStream.on('end', () => {
      ffprobe.stdin.end();
    });

    inputStream.on('error', (error) => {
      ffprobe.stdin.end();
      reject(error);
    });
  });
}

/**
 * Detect codec information from a file path
 * @param filePath - Path to the media file
 * @returns Promise resolving to codec information
 */
export async function detectCodecFromFile(filePath: string): Promise<CodecInfo> {
  const stream = createReadStream(filePath);
  return detectCodecFromStream(stream);
}

/**
 * Detect codec information from a URL (for torrent streaming)
 * Uses FFprobe directly with the URL
 * @param url - URL to the media stream
 * @param timeout - Timeout in seconds (default 30)
 * @returns Promise resolving to codec information
 */
export async function detectCodecFromUrl(
  url: string,
  timeout = 30
): Promise<CodecInfo> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-timeout', String(timeout * 1000000), // microseconds
      '-i', url,
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const output = JSON.parse(stdout) as FFprobeOutput;
        resolve(parseFFprobeOutput(output));
      } catch (error) {
        reject(new Error(`Failed to parse FFprobe output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    // Set a timeout to kill the process
    const timeoutId = setTimeout(() => {
      ffprobe.kill('SIGTERM');
      reject(new Error(`FFprobe timed out after ${timeout} seconds`));
    }, timeout * 1000);

    ffprobe.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Map FFprobe container/format names to FFmpeg demuxer names
 * FFprobe returns format names like "matroska,webm" which need to be mapped
 * to the correct FFmpeg demuxer name for pipe input
 */
const CONTAINER_TO_DEMUXER: Record<string, string> = {
  'matroska': 'matroska',
  'matroska,webm': 'matroska',
  'webm': 'matroska',
  'mov,mp4,m4a,3gp,3g2,mj2': 'mov',
  'mov': 'mov',
  'mp4': 'mov',
  'm4a': 'mov',
  'avi': 'avi',
  'flv': 'flv',
  'mpegts': 'mpegts',
  'asf': 'asf',
  'asf_o': 'asf',
  'ogg': 'ogg',
  'wav': 'wav',
  'flac': 'flac',
  'mp3': 'mp3',
  'aac': 'aac',
  'aiff': 'aiff',
  'ape': 'ape',
};

/**
 * Get the FFmpeg demuxer name for a container format
 * This is used when piping data to FFmpeg - it needs to know the input format
 * @param container - The container format from FFprobe (e.g., "matroska,webm")
 * @returns The FFmpeg demuxer name or null if unknown
 */
export function getFFmpegDemuxerForContainer(container: string): string | null {
  const normalizedContainer = container.toLowerCase();
  
  // Direct match
  if (CONTAINER_TO_DEMUXER[normalizedContainer]) {
    return CONTAINER_TO_DEMUXER[normalizedContainer];
  }
  
  // Try matching the first part (e.g., "matroska" from "matroska,webm")
  const firstPart = normalizedContainer.split(',')[0];
  if (CONTAINER_TO_DEMUXER[firstPart]) {
    return CONTAINER_TO_DEMUXER[firstPart];
  }
  
  return null;
}

/**
 * Get the FFmpeg demuxer name for a file extension
 * This is a fallback when codec detection hasn't been performed
 * @param extension - The file extension (e.g., "mkv", "mp4")
 * @returns The FFmpeg demuxer name or null if unknown
 */
export function getFFmpegDemuxerForExtension(extension: string): string | null {
  const extensionToDemuxer: Record<string, string> = {
    mkv: 'matroska',
    webm: 'matroska',
    mp4: 'mov',
    m4v: 'mov',
    mov: 'mov',
    m4a: 'mov',
    avi: 'avi',
    flv: 'flv',
    ts: 'mpegts',
    mts: 'mpegts',
    m2ts: 'mpegts',
    wmv: 'asf',
    wma: 'asf',
    asf: 'asf',
    ogg: 'ogg',
    ogv: 'ogg',
    oga: 'ogg',
    wav: 'wav',
    flac: 'flac',
    mp3: 'mp3',
    aac: 'aac',
    aiff: 'aiff',
    aif: 'aiff',
    ape: 'ape',
  };
  
  const normalizedExt = extension.toLowerCase().replace(/^\./, '');
  return extensionToDemuxer[normalizedExt] ?? null;
}

/**
 * Format codec info for database storage
 * @param codecInfo - The codec information
 * @returns Object suitable for database storage
 */
export function formatCodecInfoForDb(codecInfo: CodecInfo): {
  video_codec: string | null;
  audio_codec: string | null;
  container: string;
  duration_seconds: number | null;
  bit_rate: number | null;
  needs_transcoding: boolean;
  resolution: string | null;
} {
  const videoStream = codecInfo.streams.find((s) => s.codecType === 'video');
  const resolution = videoStream?.width && videoStream?.height
    ? `${videoStream.width}x${videoStream.height}`
    : null;

  return {
    video_codec: codecInfo.videoCodec ?? null,
    audio_codec: codecInfo.audioCodec ?? null,
    container: codecInfo.container,
    duration_seconds: codecInfo.duration ?? null,
    bit_rate: codecInfo.bitRate ?? null,
    needs_transcoding: codecInfo.needsTranscoding ?? false,
    resolution,
  };
}
