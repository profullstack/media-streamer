/**
 * Transcoding API Route
 * 
 * POST /api/transcode - Request transcoding for a file
 * GET /api/transcode/:jobId - Get transcoding job status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTranscodeProfile,
  isTranscodingSupported,
  generateOutputFilename,
  estimateTranscodeTime,
  type MediaType,
} from '@/lib/transcoding';

/**
 * Transcoding request body
 */
interface TranscodeRequest {
  /** Torrent ID */
  torrentId: string;
  /** File ID */
  fileId: string;
  /** Original filename */
  filename: string;
  /** Media type (video or audio) */
  mediaType: MediaType;
  /** File size in bytes (for estimation) */
  fileSize?: number;
}

/**
 * Transcoding response
 */
interface TranscodeResponse {
  /** Whether transcoding is supported for this format */
  supported: boolean;
  /** Output format if transcoding is supported */
  outputFormat?: string;
  /** Output filename */
  outputFilename?: string;
  /** Estimated transcoding time in seconds */
  estimatedTime?: number;
  /** Transcoding profile details */
  profile?: {
    videoCodec?: string;
    audioCodec?: string;
    videoBitrate?: string;
    audioBitrate?: string;
  };
  /** Error message if not supported */
  error?: string;
}

/**
 * Extract format from filename
 */
function extractFormat(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * POST /api/transcode
 * Check if transcoding is available and get transcoding info
 */
export async function POST(request: NextRequest): Promise<NextResponse<TranscodeResponse>> {
  // Subscription check
  const { requireActiveSubscription } = await import('@/lib/subscription/guard');
  const subscriptionError = await requireActiveSubscription(request);
  if (subscriptionError) return subscriptionError as NextResponse<TranscodeResponse>;

  try {
    const body = await request.json() as TranscodeRequest;
    const { filename, mediaType, fileSize } = body;

    // Validate required fields
    if (!filename) {
      return NextResponse.json(
        { supported: false, error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!mediaType || !['video', 'audio'].includes(mediaType)) {
      return NextResponse.json(
        { supported: false, error: 'Valid mediaType (video or audio) is required' },
        { status: 400 }
      );
    }

    // Extract format from filename
    const format = extractFormat(filename);
    if (!format) {
      return NextResponse.json(
        { supported: false, error: 'Could not determine file format' },
        { status: 400 }
      );
    }

    // Check if transcoding is supported
    if (!isTranscodingSupported(mediaType, format)) {
      return NextResponse.json({
        supported: false,
        error: `Format ${format.toUpperCase()} does not require transcoding or is not supported`,
      });
    }

    // Get transcoding profile
    const profile = getTranscodeProfile(mediaType, format);
    if (!profile) {
      return NextResponse.json({
        supported: false,
        error: 'Could not determine transcoding profile',
      });
    }

    // Generate output filename
    const outputFilename = generateOutputFilename(filename, profile.outputFormat);

    // Estimate transcoding time
    const estimatedTime = fileSize 
      ? estimateTranscodeTime(fileSize, mediaType)
      : undefined;

    return NextResponse.json({
      supported: true,
      outputFormat: profile.outputFormat,
      outputFilename,
      estimatedTime,
      profile: {
        videoCodec: profile.videoCodec,
        audioCodec: profile.audioCodec,
        videoBitrate: profile.videoBitrate,
        audioBitrate: profile.audioBitrate,
      },
    });
  } catch (error) {
    console.error('Transcoding check error:', error);
    return NextResponse.json(
      { supported: false, error: 'Failed to check transcoding availability' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/transcode
 * Get transcoding service status
 */
export async function GET(): Promise<NextResponse> {
  // Check if FFmpeg is available (would be done via environment check in production)
  const ffmpegAvailable = process.env.FFMPEG_ENABLED === 'true';

  return NextResponse.json({
    enabled: ffmpegAvailable,
    supportedVideoFormats: ['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts'],
    supportedAudioFormats: ['flac', 'wma', 'aiff', 'ape'],
    outputVideoFormat: 'mp4',
    outputAudioFormat: 'mp3',
  });
}
