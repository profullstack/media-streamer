/**
 * Streaming API Route
 *
 * Provides HTTP streaming for audio, video, and ebook files from torrents.
 * Supports HTTP range requests for seeking.
 * Supports transcoding for non-browser-supported formats.
 *
 * FREE - No authentication required to encourage usage.
 *
 * GET /api/stream?infohash=...&fileIndex=...&transcode=auto
 * GET /api/stream?infohash=...&fileIndex=...&demuxer=matroska
 * HEAD /api/stream?infohash=...&fileIndex=...
 *
 * Query params:
 * - infohash: torrent infohash (required)
 * - fileIndex: file index in torrent (required)
 * - transcode: 'auto' to enable transcoding with auto-detected demuxer from file extension
 * - demuxer: FFmpeg demuxer name for transcoding (e.g., 'matroska', 'mov', 'flac')
 *            This should come from codec detection stored in the database.
 *            When provided, transcoding will be enabled with the specified input format.
 *            Takes precedence over transcode=auto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';
import {
  getStreamingService,
  StreamingError,
  FileNotFoundError,
  RangeNotSatisfiableError,
} from '@/lib/streaming';
import { createLogger, generateRequestId } from '@/lib/logger';
import { getTorrentByInfohash } from '@/lib/supabase';
import {
  needsTranscoding,
  detectMediaType,
  getStreamingTranscodeProfile,
  buildStreamingFFmpegArgs,
  getTranscodedMimeType,
  getPreBufferSize,
  TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
} from '@/lib/transcoding';
import { getFFmpegDemuxerForExtension } from '@/lib/codec-detection';
import {
  getFileTranscodingService,
} from '@/lib/file-transcoding';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

const logger = createLogger('API:stream');

/**
 * Parse Range header
 * Supports formats: bytes=0-999, bytes=500-, bytes=-500
 */
function parseRangeHeader(
  rangeHeader: string | null,
  fileSize: number
): { start: number; end: number } | null {
  if (!rangeHeader) return null;

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;

  const [, startStr, endStr] = match;

  let start: number;
  let end: number;

  if (startStr === '' && endStr !== '') {
    // bytes=-500 (last 500 bytes)
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else if (startStr !== '' && endStr === '') {
    // bytes=500- (from 500 to end)
    start = parseInt(startStr, 10);
    end = fileSize - 1;
  } else if (startStr !== '' && endStr !== '') {
    // bytes=0-999
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
  } else {
    return null;
  }

  // Validate range
  if (start < 0 || end >= fileSize || start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Validate request parameters
 */
function validateParams(
  searchParams: URLSearchParams
): { infohash: string; fileIndex: number; demuxer: string | null; transcode: string | null } | { error: string; status: number } {
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');
  const demuxer = searchParams.get('demuxer');
  const transcode = searchParams.get('transcode');

  if (!infohash) {
    return { error: 'Missing required parameter: infohash', status: 400 };
  }

  if (!fileIndexStr) {
    return { error: 'Missing required parameter: fileIndex', status: 400 };
  }

  const fileIndex = parseInt(fileIndexStr, 10);
  if (isNaN(fileIndex) || fileIndex < 0) {
    return { error: 'fileIndex must be a non-negative integer', status: 400 };
  }

  return { infohash, fileIndex, demuxer, transcode };
}

/**
 * Get magnet URI from database or build a basic one as fallback
 * The stored magnet URI contains all the trackers from the original submission
 */
async function getMagnetUri(infohash: string): Promise<string> {
  const torrent = await getTorrentByInfohash(infohash);
  if (torrent?.magnet_uri) {
    return torrent.magnet_uri;
  }
  // Fallback to basic magnet URI if not found in database
  return `magnet:?xt=urn:btih:${infohash}`;
}

/**
 * Convert Node.js Readable stream to Web ReadableStream
 * Handles edge cases where stream events fire in unexpected order
 */
function nodeStreamToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  let controllerClosed = false;
  
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        if (!controllerClosed) {
          try {
            controller.enqueue(new Uint8Array(chunk));
          } catch {
            // Controller may be closed if client disconnected
            controllerClosed = true;
          }
        }
      });
      
      nodeStream.on('end', () => {
        if (!controllerClosed) {
          controllerClosed = true;
          try {
            controller.close();
          } catch {
            // Controller may already be closed
          }
        }
      });
      
      nodeStream.on('error', (err: Error) => {
        if (!controllerClosed) {
          controllerClosed = true;
          try {
            controller.error(err);
          } catch {
            // Controller may already be closed
          }
        }
      });
    },
    cancel() {
      controllerClosed = true;
      if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
        nodeStream.destroy();
      }
    },
  });
}

/**
 * Convert Node.js Readable stream to Web ReadableStream with pre-buffering
 * Collects data until buffer threshold is reached before sending to client
 * This prevents buffering during playback by giving the player a head start
 */
function nodeStreamToWebStreamWithPreBuffer(
  nodeStream: NodeJS.ReadableStream,
  preBufferBytes: number,
  preBufferTimeoutMs: number,
  reqLogger: ReturnType<typeof logger.child>
): ReadableStream<Uint8Array> {
  let controllerClosed = false;
  let preBufferComplete = false;
  const preBuffer: Buffer[] = [];
  let preBufferSize = 0;
  let preBufferResolver: (() => void) | null = null;
  let preBufferTimeout: ReturnType<typeof setTimeout> | null = null;

  // Maximum preBuffer size to prevent memory exhaustion (3x target or 100MB, whichever is smaller)
  const MAX_PREBUFFER_SIZE = Math.min(preBufferBytes * 3, 100 * 1024 * 1024);
  
  // Controller reference captured from start() for use in named handlers
  let controller: ReadableStreamDefaultController<Uint8Array>;

  // Create a promise that resolves when pre-buffer is ready
  const preBufferReady = new Promise<void>((resolve) => {
    preBufferResolver = resolve;
  });

  // Named handlers for proper listener cleanup
  const onData = (chunk: Buffer): void => {
    if (controllerClosed) return;

    if (!preBufferComplete) {
      // Still collecting pre-buffer
      preBuffer.push(chunk);
      preBufferSize += chunk.length;

      // Safety check: abort if preBuffer grows too large (prevents memory exhaustion)
      if (preBufferSize > MAX_PREBUFFER_SIZE) {
        reqLogger.error('Pre-buffer exceeded maximum size, aborting stream', {
          bufferedBytes: preBufferSize,
          maxBytes: MAX_PREBUFFER_SIZE,
          targetBytes: preBufferBytes,
        });
        preBufferComplete = true;
        if (preBufferTimeout) {
          clearTimeout(preBufferTimeout);
          preBufferTimeout = null;
        }
        if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
          nodeStream.destroy(new Error('Pre-buffer exceeded maximum size'));
        }
        // Clear the buffer to free memory immediately
        preBuffer.length = 0;
        preBufferResolver?.();
        return;
      }

      if (preBufferSize >= preBufferBytes) {
        reqLogger.info('Pre-buffer complete, starting playback', {
          bufferedBytes: preBufferSize,
          targetBytes: preBufferBytes,
        });
        preBufferComplete = true;
        if (preBufferTimeout) {
          clearTimeout(preBufferTimeout);
          preBufferTimeout = null;
        }
        preBufferResolver?.();
      }
    } else {
      // Pre-buffer complete, send directly
      try {
        controller.enqueue(new Uint8Array(chunk));
      } catch {
        controllerClosed = true;
      }
    }
  };

  const onEnd = (): void => {
    removeStreamListeners();
    // If stream ends before pre-buffer is complete, flush what we have
    if (!preBufferComplete) {
      reqLogger.info('Stream ended before pre-buffer complete, flushing', {
        bufferedBytes: preBufferSize,
        targetBytes: preBufferBytes,
      });
      preBufferComplete = true;
      if (preBufferTimeout) {
        clearTimeout(preBufferTimeout);
        preBufferTimeout = null;
      }
      preBufferResolver?.();
    }

    if (!controllerClosed) {
      controllerClosed = true;
      try {
        controller.close();
      } catch {
        // Controller may already be closed
      }
    }
  };

  const onError = (err: Error): void => {
    removeStreamListeners();
    if (preBufferTimeout) {
      clearTimeout(preBufferTimeout);
      preBufferTimeout = null;
    }
    if (!controllerClosed) {
      controllerClosed = true;
      try {
        controller.error(err);
      } catch {
        // Controller may already be closed
      }
    }
  };

  const removeStreamListeners = (): void => {
    nodeStream.removeListener('data', onData);
    nodeStream.removeListener('end', onEnd);
    nodeStream.removeListener('error', onError);
  };

  return new ReadableStream({
    async start(ctrl) {
      controller = ctrl;
      // Set up timeout for pre-buffer
      preBufferTimeout = setTimeout(() => {
        if (!preBufferComplete) {
          // Check if we have enough data to even start playback
          // For HEVC/H.265 video, FFmpeg needs significantly more data to:
          // 1. Parse NAL units and find SPS/PPS (Sequence/Picture Parameter Sets)
          // 2. Initialize the HEVC decoder
          // 3. Build the reference frame buffer
          // Use 5% of target buffer as minimum, with 512KB floor for video
          // This means: video (10MB target) -> 512KB min, audio (2MB target) -> 100KB min
          const MIN_BYTES_FOR_PLAYBACK = Math.max(
            Math.floor(preBufferBytes * 0.05), // 5% of target
            preBufferBytes >= 5 * 1024 * 1024 ? 512 * 1024 : 64 * 1024 // 512KB for video, 64KB for audio
          );

          if (preBufferSize < MIN_BYTES_FOR_PLAYBACK) {
            reqLogger.error('Pre-buffer timeout with insufficient data - torrent may have no seeders', {
              bufferedBytes: preBufferSize,
              minimumRequired: MIN_BYTES_FOR_PLAYBACK,
              targetBytes: preBufferBytes,
              timeoutMs: preBufferTimeoutMs,
            });
            // Signal error by closing the stream
            preBufferComplete = true;
            if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
              nodeStream.destroy(new Error('Insufficient data from torrent - no seeders available'));
            }
            preBufferResolver?.();
            return;
          }

          reqLogger.info('Pre-buffer timeout reached, starting playback with partial buffer', {
            bufferedBytes: preBufferSize,
            targetBytes: preBufferBytes,
            timeoutMs: preBufferTimeoutMs,
          });
          preBufferComplete = true;
          preBufferResolver?.();
        }
      }, preBufferTimeoutMs);

      nodeStream.on('data', onData);
      nodeStream.on('end', onEnd);
      nodeStream.on('error', onError);
      
      // Wait for pre-buffer to be ready
      await preBufferReady;
      
      // Flush pre-buffer to client
      if (!controllerClosed && preBuffer.length > 0) {
        reqLogger.debug('Flushing pre-buffer to client', {
          chunks: preBuffer.length,
          totalBytes: preBufferSize,
        });
        for (const chunk of preBuffer) {
          try {
            controller.enqueue(new Uint8Array(chunk));
          } catch {
            controllerClosed = true;
            break;
          }
        }
        // Clear the buffer to free memory
        preBuffer.length = 0;
      }
    },
    cancel() {
      controllerClosed = true;
      removeStreamListeners();
      if (preBufferTimeout) {
        clearTimeout(preBufferTimeout);
        preBufferTimeout = null;
      }
      if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
        nodeStream.destroy();
      }
    },
  });
}

/**
 * Create a transcoded stream by piping torrent stream through FFmpeg
 * All operations are wrapped in try/catch to prevent server crashes
 * @param sourceStream - The source stream to transcode
 * @param fileName - The original filename for format detection
 * @param reqLogger - Logger instance for this request
 * @param inputDemuxer - FFmpeg demuxer name for the input format (e.g., 'matroska', 'mov')
 *                       This is required for pipe input since FFmpeg cannot auto-detect format
 */
function createTranscodedStream(
  sourceStream: NodeJS.ReadableStream,
  fileName: string,
  reqLogger: ReturnType<typeof logger.child>,
  inputDemuxer: string
): { stream: NodeJS.ReadableStream; mimeType: string } | null {
  try {
    const mediaType = detectMediaType(fileName);
    if (!mediaType) {
      reqLogger.warn('Cannot detect media type for transcoding', { fileName });
      return null;
    }

    // Extract format from filename for profile selection
    const format = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!format) {
      reqLogger.warn('Cannot extract format from filename', { fileName });
      return null;
    }

    // Always force transcoding since demuxer was explicitly provided
    // This handles cases where the container is supported but the codec isn't (e.g., HEVC in MP4)
    const profile = getStreamingTranscodeProfile(mediaType, format, true);
    if (!profile) {
      reqLogger.warn('No transcoding profile available', { fileName, mediaType, format, inputDemuxer });
      return null;
    }

    // Pass the input demuxer to FFmpeg args builder
    // This is critical for non-seekable pipe streams where FFmpeg cannot auto-detect format
    const ffmpegArgs = buildStreamingFFmpegArgs(profile, inputDemuxer);
    const outputMimeType = getTranscodedMimeType(mediaType, format, true);
    if (!outputMimeType) {
      reqLogger.warn('Cannot determine output MIME type', { fileName, mediaType, format });
      return null;
    }

    reqLogger.info('Starting FFmpeg transcoding', {
      fileName,
      mediaType,
      format,
      outputFormat: profile.outputFormat,
      outputMimeType,
      ffmpegArgs: ffmpegArgs.join(' '),
    });

    let ffmpeg;
    let ffmpegManagerId: string | null = null;
    try {
      ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      // Register with FFmpeg manager for tracking and automatic cleanup
      const ffmpegManager = getFFmpegManager();
      ffmpegManagerId = ffmpegManager.register(ffmpeg, {
        fileName,
      });
      reqLogger.debug('FFmpeg process registered with manager', {
        ffmpegManagerId,
        pid: ffmpeg.pid,
      });
    } catch (spawnError) {
      reqLogger.error('Failed to spawn FFmpeg process', spawnError);
      return null;
    }

    // Create a PassThrough stream for the output
    const outputStream = new PassThrough();

    // Track if streams are already destroyed to prevent double-destroy errors
    let ffmpegKilled = false;
    let outputDestroyed = false;

    const safeKillFFmpeg = (): void => {
      if (!ffmpegKilled && ffmpeg) {
        ffmpegKilled = true;
        try {
          ffmpeg.kill('SIGTERM');
        } catch (killError) {
          reqLogger.debug('Error killing FFmpeg (may already be dead)', { error: String(killError) });
        }
      }
    };

    // Helper to ensure we always have an Error instance
    const toError = (err: unknown): Error => {
      if (err instanceof Error) return err;
      if (typeof err === 'object' && err !== null) {
        const errObj = err as Record<string, unknown>;
        const message = errObj.message ?? errObj.error ?? errObj.reason ?? JSON.stringify(err);
        return new Error(String(message));
      }
      return new Error(String(err));
    };

    const safeDestroyOutput = (err?: unknown): void => {
      if (!outputDestroyed) {
        outputDestroyed = true;
        try {
          if (err) {
            outputStream.destroy(toError(err));
          } else {
            outputStream.destroy();
          }
        } catch (destroyError) {
          reqLogger.debug('Error destroying output stream', { error: String(destroyError) });
        }
      }
    };

    // Log source stream state before piping
    reqLogger.info('Source stream state before piping to FFmpeg', {
      readable: (sourceStream as { readable?: boolean }).readable,
      readableFlowing: (sourceStream as { readableFlowing?: boolean | null }).readableFlowing,
      readableLength: (sourceStream as { readableLength?: number }).readableLength,
    });

    // Pipe source stream to FFmpeg stdin with error handling
    try {
      sourceStream.pipe(ffmpeg.stdin);
      reqLogger.info('Successfully piped source stream to FFmpeg stdin');
    } catch (pipeError) {
      reqLogger.error('Failed to pipe source to FFmpeg stdin', pipeError);
      safeKillFFmpeg();
      return null;
    }

    // Track bytes received by FFmpeg stdin
    let bytesReceivedByFFmpeg = 0;
    let lastLoggedBytes = 0;
    sourceStream.on('data', (chunk: Buffer) => {
      bytesReceivedByFFmpeg += chunk.length;
      if (bytesReceivedByFFmpeg === chunk.length) {
        // First chunk received
        reqLogger.info('First data chunk received by source stream', {
          chunkSize: chunk.length,
        });
      }
      // Log progress every 1MB
      if (bytesReceivedByFFmpeg - lastLoggedBytes >= 1024 * 1024) {
        reqLogger.info('Source stream progress', {
          bytesReceived: bytesReceivedByFFmpeg,
          bytesReceivedMB: (bytesReceivedByFFmpeg / (1024 * 1024)).toFixed(2),
        });
        lastLoggedBytes = bytesReceivedByFFmpeg;
      }
    });

    // Track bytes output by FFmpeg
    let bytesOutputByFFmpeg = 0;
    let lastLoggedOutputBytes = 0;
    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      bytesOutputByFFmpeg += chunk.length;
      if (bytesOutputByFFmpeg === chunk.length) {
        // First output chunk
        reqLogger.info('First output chunk from FFmpeg', {
          chunkSize: chunk.length,
        });
      }
      // Log progress every 1MB
      if (bytesOutputByFFmpeg - lastLoggedOutputBytes >= 1024 * 1024) {
        reqLogger.info('FFmpeg output progress', {
          bytesOutput: bytesOutputByFFmpeg,
          bytesOutputMB: (bytesOutputByFFmpeg / (1024 * 1024)).toFixed(2),
          bytesInput: bytesReceivedByFFmpeg,
          bytesInputMB: (bytesReceivedByFFmpeg / (1024 * 1024)).toFixed(2),
        });
        lastLoggedOutputBytes = bytesOutputByFFmpeg;
      }
    });

    // Log when FFmpeg stdin receives data
    ffmpeg.stdin.on('drain', () => {
      reqLogger.debug('FFmpeg stdin drained', { bytesReceivedByFFmpeg });
    });

    // Pipe FFmpeg stdout to output stream with error handling
    try {
      ffmpeg.stdout.pipe(outputStream);
    } catch (pipeError) {
      reqLogger.error('Failed to pipe FFmpeg stdout to output', pipeError);
      safeKillFFmpeg();
      return null;
    }

    // Handle FFmpeg stdin errors (source stream closed unexpectedly)
    ffmpeg.stdin.on('error', (err: Error) => {
      // EPIPE is expected when FFmpeg closes stdin early (e.g., on error)
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        reqLogger.warn('FFmpeg stdin error', { error: err.message });
      }
    });

    // Handle FFmpeg stderr (logging only)
    // Limit buffer size to prevent memory leaks during long transcoding sessions
    const MAX_STDERR_BUFFER = 10000; // 10KB max
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data: Buffer) => {
      try {
        stderrBuffer += data.toString();
        // Limit buffer size to prevent memory leaks
        if (stderrBuffer.length > MAX_STDERR_BUFFER) {
          stderrBuffer = stderrBuffer.slice(-MAX_STDERR_BUFFER);
        }
        // Log progress periodically (FFmpeg outputs progress to stderr)
        if (stderrBuffer.includes('frame=') || stderrBuffer.includes('time=')) {
          const lines = stderrBuffer.split('\n');
          const lastLine = lines[lines.length - 2] || lines[lines.length - 1];
          if (lastLine.trim()) {
            reqLogger.debug('FFmpeg progress', { progress: lastLine.trim() });
          }
          stderrBuffer = lines[lines.length - 1];
        }
      } catch {
        // Ignore logging errors
      }
    });

    // Handle FFmpeg process errors
    ffmpeg.on('error', (err: Error) => {
      reqLogger.error('FFmpeg process error', err);
      safeDestroyOutput(err);
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0 && code !== null) {
        reqLogger.warn('FFmpeg exited with non-zero code', { code, stderr: stderrBuffer.slice(-500) });
      } else {
        reqLogger.info('FFmpeg transcoding completed');
      }
    });

    // Handle source stream errors
    sourceStream.on('error', (err: Error) => {
      reqLogger.error('Source stream error during transcoding', err);
      safeKillFFmpeg();
      safeDestroyOutput(err);
    });

    // Handle output stream close (client disconnected)
    outputStream.on('close', () => {
      reqLogger.debug('Output stream closed, killing FFmpeg');
      safeKillFFmpeg();
    });

    // Handle output stream errors
    outputStream.on('error', (err: Error) => {
      reqLogger.error('Output stream error', err);
      safeKillFFmpeg();
    });

    return { stream: outputStream, mimeType: outputMimeType };
  } catch (error) {
    reqLogger.error('Unexpected error in createTranscodedStream', error);
    return null;
  }
}

/**
 * GET /api/stream
 * Stream a file from a torrent
 * FREE - No authentication required.
 *
 * Query params:
 * - infohash: torrent infohash (required)
 * - fileIndex: file index in torrent (required)
 * - demuxer: FFmpeg demuxer name for transcoding (e.g., 'matroska', 'mov', 'flac')
 *            When provided, transcoding is enabled with the specified input format.
 *            This should come from codec detection stored in the database.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  // Log immediately at the start of the request
  const url = request.url;
  reqLogger.info('=== STREAM REQUEST RECEIVED ===', {
    url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
  });
  
  const { searchParams } = new URL(url);
  
  // Log all search params for debugging
  reqLogger.info('Request parameters', {
    infohash: searchParams.get('infohash'),
    fileIndex: searchParams.get('fileIndex'),
    transcode: searchParams.get('transcode'),
    demuxer: searchParams.get('demuxer'),
    allParams: Object.fromEntries(searchParams.entries()),
  });
  
  const validation = validateParams(searchParams);

  if ('error' in validation) {
    reqLogger.warn('Invalid stream request', { error: validation.error });
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { infohash, fileIndex, demuxer, transcode } = validation;
  
  reqLogger.info('Stream request validated', {
    infohash,
    fileIndex,
    transcode,
    demuxer,
  });
  
  const magnetUri = await getMagnetUri(infohash);
  const rangeHeader = request.headers.get('Range');

  reqLogger.info('GET /api/stream', {
    infohash,
    fileIndex,
    hasRange: !!rangeHeader,
    rangeHeader,
    demuxer,
    magnetUri: magnetUri.substring(0, 100) + '...',
  });

  try {
    const service = getStreamingService();

    // Get file info first to check if transcoding is needed
    reqLogger.info('Getting stream info - this may take up to 60 seconds if torrent is not cached');
    const streamInfoStartTime = Date.now();
    let info;
    try {
      info = await service.getStreamInfo({ magnetUri, fileIndex });
    } catch (infoError) {
      const elapsed = Date.now() - streamInfoStartTime;
      reqLogger.error('Failed to get stream info', infoError, {
        elapsed: `${elapsed}ms`,
        magnetUri: magnetUri.substring(0, 100) + '...',
      });
      return NextResponse.json(
        { error: 'Failed to connect to torrent. Please try again in a few seconds.' },
        { status: 503 }
      );
    }
    const streamInfoElapsed = Date.now() - streamInfoStartTime;
    reqLogger.info('Stream info retrieved successfully', {
      fileName: info.fileName,
      size: info.size,
      mimeType: info.mimeType,
      elapsed: `${streamInfoElapsed}ms`,
    });

    // Check if transcoding is requested
    // Transcoding can be requested in two ways:
    // 1. demuxer=<format> - explicit demuxer from codec detection DB (takes precedence)
    // 2. transcode=auto - derive demuxer from file extension (only for formats that support pipe transcoding)
    // This handles cases where:
    // 1. The file extension requires transcoding (e.g., .mkv, .avi)
    // 2. The file extension is "supported" (e.g., .mp4) but the codec isn't (e.g., HEVC/H.265)
    //
    // IMPORTANT: MP4/MOV/M4V files CANNOT be transcoded via pipe because:
    // - The moov atom (file metadata) is at the END of the file
    // - FFmpeg needs the moov atom to decode the file
    // - When streaming from a torrent, data comes sequentially from the beginning
    // - This causes "moov atom not found" errors
    // For MP4 files with incompatible codecs (HEVC), the client should use demuxer=mov explicitly
    // after codec detection confirms the file needs transcoding.
    const formatNeedsTranscoding = needsTranscoding(info.fileName);
    
    // Formats that CANNOT be transcoded via pipe (moov atom at end)
    // These should only be transcoded when explicitly requested via demuxer parameter
    const PIPE_INCOMPATIBLE_FORMATS = new Set(['mp4', 'm4v', 'mov', 'm4a', '3gp', '3g2']);
    
    // Determine the effective demuxer to use
    // Priority: explicit demuxer > auto-detect from extension (excluding pipe-incompatible formats)
    let effectiveDemuxer: string | null = demuxer;
    let useFileBasedTranscoding = false;
    
    if (!effectiveDemuxer && transcode === 'auto') {
      // Derive demuxer from file extension
      const ext = info.fileName.split('.').pop()?.toLowerCase();
      if (ext) {
        // Check if this format requires file-based transcoding (MP4/MOV with moov atom at end)
        if (PIPE_INCOMPATIBLE_FORMATS.has(ext)) {
          reqLogger.info('Format requires file-based transcoding', {
            extension: ext,
            reason: 'MP4/MOV formats have moov atom at end, will download first then transcode',
          });
          // For file-based transcoding, we use 'mov' demuxer (works for mp4/m4v/mov)
          effectiveDemuxer = 'mov';
          useFileBasedTranscoding = true;
        } else {
          effectiveDemuxer = getFFmpegDemuxerForExtension(ext);
          reqLogger.info('Auto-detected demuxer from file extension', {
            extension: ext,
            demuxer: effectiveDemuxer,
          });
        }
      }
    } else if (effectiveDemuxer) {
      // Check if explicit demuxer is for a pipe-incompatible format
      const ext = info.fileName.split('.').pop()?.toLowerCase();
      if (ext && PIPE_INCOMPATIBLE_FORMATS.has(ext)) {
        useFileBasedTranscoding = true;
        reqLogger.info('Explicit demuxer for pipe-incompatible format, using file-based transcoding', {
          extension: ext,
          demuxer: effectiveDemuxer,
        });
      }
    }
    
    const shouldTranscode = effectiveDemuxer !== null;
    
    reqLogger.info('Transcoding decision', {
      transcode,
      demuxer,
      effectiveDemuxer,
      fileName: info.fileName,
      formatNeedsTranscoding,
      shouldTranscode,
      reason: shouldTranscode
        ? `Transcoding with demuxer: ${effectiveDemuxer}`
        : 'No transcoding requested (no demuxer or transcode=auto parameter)',
    });
    
    if (shouldTranscode && effectiveDemuxer) {
      reqLogger.info('=== STARTING TRANSCODING PATH ===', {
        fileName: info.fileName,
        originalMimeType: info.mimeType,
        fileSize: info.size,
        useFileBasedTranscoding,
      });

      // For MP4/MOV files, use file-based transcoding because the moov atom is at the end
      // This requires downloading the entire file first before transcoding
      if (useFileBasedTranscoding) {
        reqLogger.info('Using FILE-BASED transcoding (moov atom at end)', {
          fileName: info.fileName,
          fileSize: info.size,
          fileSizeMB: (info.size / (1024 * 1024)).toFixed(2),
        });

        // Create stream without waiting for data - we'll download the entire file
        const result = await service.createStream({
          magnetUri,
          fileIndex,
          range: undefined,
        }, true); // skipWaitForData = true - we'll handle buffering ourselves

        const fileTranscodingService = getFileTranscodingService();

        try {
          // Download the entire file first, then transcode
          const transcoded = await fileTranscodingService.downloadAndTranscode(
            result.stream as Readable,
            infohash,
            fileIndex,
            info.fileName,
            info.size
          );

          reqLogger.info('File-based transcoding started', {
            infohash,
            fileIndex,
            mimeType: transcoded.mimeType,
          });

          // Get appropriate pre-buffer size based on media type
          const preBufferBytes = getPreBufferSize(info.fileName);

          // CORS headers for cross-origin audio/video playback
          const headers: HeadersInit = {
            'Content-Type': transcoded.mimeType,
            'Cache-Control': 'no-cache',
            'X-Stream-Id': result.streamId,
            'X-Transcoded': 'true',
            'X-File-Based-Transcode': 'true',
            'X-Original-Mime-Type': info.mimeType,
            'X-Pre-Buffer-Bytes': preBufferBytes.toString(),
            'Transfer-Encoding': 'chunked',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, X-Transcoded, X-File-Based-Transcode, X-Pre-Buffer-Bytes',
          };

          return new Response(
            nodeStreamToWebStreamWithPreBuffer(
              transcoded.stream,
              preBufferBytes,
              TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
              reqLogger
            ),
            {
              status: 200,
              headers,
            }
          );
        } catch (downloadError) {
          reqLogger.error('File-based transcoding failed', downloadError);
          return NextResponse.json(
            { error: 'Failed to download and transcode file. The torrent may not have enough seeders.' },
            { status: 503 }
          );
        }
      }

      // For non-MP4/MOV files, use pipe-based transcoding (faster, no download required)
      reqLogger.info('Using PIPE-BASED transcoding', {
        fileName: info.fileName,
        demuxer: effectiveDemuxer,
      });

      // For transcoding, we don't support range requests (transcoded output has unknown size)
      // IMPORTANT: We skip waiting for data because FFmpeg handles buffering internally.
      // FFmpeg will wait for data from the pipe and start transcoding as soon as it has enough
      // to read the file headers. This allows streaming to start immediately without waiting
      // for a minimum buffer size, which is especially important for formats like FLAC that
      // can be transcoded in real-time as data arrives.
      reqLogger.debug('Creating stream for transcoding (FFmpeg handles buffering)');
      const result = await service.createStream({
        magnetUri,
        fileIndex,
        range: undefined,
      }, true); // skipWaitForData = true - FFmpeg handles buffering internally

      // Log stream state before transcoding
      const nodeStream = result.stream as NodeJS.ReadableStream;
      reqLogger.info('Stream created for transcoding', {
        streamId: result.streamId,
        readable: (nodeStream as { readable?: boolean }).readable,
        readableFlowing: (nodeStream as { readableFlowing?: boolean | null }).readableFlowing,
        readableLength: (nodeStream as { readableLength?: number }).readableLength,
      });

      // CRITICAL: Create a PassThrough stream to buffer the first chunk
      // We need to wait for the first data chunk to ensure the stream is actually flowing
      // and has valid data before piping to FFmpeg.
      // Using a PassThrough stream ensures no data is lost (unshift doesn't work reliably in flowing mode)
      const bufferedStream = new PassThrough();
      let firstChunkReceived = false;

      // Use longer timeout for video (especially HEVC/H.265) which needs more initial data
      // Video files have larger pieces and HEVC requires more data for decoder initialization
      const mediaType = detectMediaType(info.fileName);
      const firstChunkTimeoutMs = mediaType === 'video' ? 60000 : 30000; // 60s for video, 30s for audio

      const streamFlowingPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Stream did not start flowing within ${firstChunkTimeoutMs / 1000} seconds`));
        }, firstChunkTimeoutMs);

        const onData = (chunk: Buffer): void => {
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            clearTimeout(timeout);
            reqLogger.info('First data chunk received from WebTorrent stream', {
              chunkSize: chunk.length,
              streamId: result.streamId,
            });
            resolve();
          }
          // Write all chunks to the buffered stream
          bufferedStream.write(chunk);
        };

        const onError = (err: Error): void => {
          clearTimeout(timeout);
          bufferedStream.destroy(err);
          reject(err);
        };

        const onEnd = (): void => {
          clearTimeout(timeout);
          if (!firstChunkReceived) {
            reject(new Error('Stream ended without emitting any data'));
          }
          bufferedStream.end();
        };

        nodeStream.on('error', onError);
        nodeStream.on('end', onEnd);
        nodeStream.on('data', onData);
      });

      try {
        await streamFlowingPromise;
        reqLogger.info('Stream confirmed flowing, proceeding with transcoding');
      } catch (flowError) {
        reqLogger.error('Stream failed to start flowing', flowError);
        return NextResponse.json(
          { error: 'Failed to start streaming from torrent. The file may not be available.' },
          { status: 503 }
        );
      }

      // Pass the demuxer to tell FFmpeg the input format
      // This is required for pipe input since FFmpeg cannot auto-detect format
      // Use the bufferedStream which contains all data including the first chunk
      const transcoded = createTranscodedStream(
        bufferedStream,
        info.fileName,
        reqLogger,
        effectiveDemuxer // FFmpeg demuxer name (from DB or auto-detected from extension)
      );

      if (!transcoded) {
        reqLogger.error('Failed to create transcoded stream');
        return NextResponse.json(
          { error: 'Failed to transcode file' },
          { status: 500 }
        );
      }

      // Get appropriate pre-buffer size based on media type
      // Video needs 10MB buffer (~40 seconds at 2Mbps), audio needs 2MB
      const preBufferBytes = getPreBufferSize(info.fileName);
      
      reqLogger.info('Returning transcoded stream with pre-buffer', {
        streamId: result.streamId,
        originalMimeType: info.mimeType,
        transcodedMimeType: transcoded.mimeType,
        preBufferBytes,
        preBufferTimeoutMs: TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
      });

      // Transcoded streams don't have a known Content-Length
      // CORS headers for cross-origin audio/video playback (required for iOS Safari)
      const headers: HeadersInit = {
        'Content-Type': transcoded.mimeType,
        'Cache-Control': 'no-cache',
        'X-Stream-Id': result.streamId,
        'X-Transcoded': 'true',
        'X-Original-Mime-Type': info.mimeType,
        'X-Pre-Buffer-Bytes': preBufferBytes.toString(),
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, X-Transcoded, X-Pre-Buffer-Bytes',
      };

      // Use pre-buffered stream to prevent buffering during playback
      // Video gets 10MB buffer (~40 seconds), audio gets 2MB buffer
      return new Response(
        nodeStreamToWebStreamWithPreBuffer(
          transcoded.stream,
          preBufferBytes,
          TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
          reqLogger
        ),
        {
          status: 200,
          headers,
        }
      );
    }

    // Non-transcoded path: support range requests
    let range: { start: number; end: number } | undefined;
    if (rangeHeader) {
      const parsedRange = parseRangeHeader(rangeHeader, info.size);
      if (parsedRange) {
        range = parsedRange;
        reqLogger.debug('Range parsed', {
          start: range.start,
          end: range.end,
          length: range.end - range.start + 1
        });
      } else {
        reqLogger.warn('Failed to parse range header', { rangeHeader, fileSize: info.size });
      }
    }

    reqLogger.debug('Creating stream', { infohash, fileIndex, range });
    const result = await service.createStream({
      magnetUri,
      fileIndex,
      range,
    });

    reqLogger.info('Stream created', {
      streamId: result.streamId,
      size: result.size,
      mimeType: result.mimeType,
      isPartial: result.isPartial,
      contentRange: result.contentRange
    });

    // CORS headers for cross-origin audio/video playback (required for iOS Safari)
    const headers: HeadersInit = {
      'Content-Type': result.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'X-Stream-Id': result.streamId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    };

    if (result.isPartial && result.contentRange && result.contentLength) {
      headers['Content-Range'] = result.contentRange;
      headers['Content-Length'] = result.contentLength.toString();

      reqLogger.debug('Returning partial content (206)', {
        contentRange: result.contentRange,
        contentLength: result.contentLength
      });

      return new Response(nodeStreamToWebStream(result.stream as NodeJS.ReadableStream), {
        status: 206,
        headers,
      });
    }

    headers['Content-Length'] = result.size.toString();

    reqLogger.debug('Returning full content (200)', { contentLength: result.size });

    return new Response(nodeStreamToWebStream(result.stream as NodeJS.ReadableStream), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      reqLogger.warn('File not found', { infohash, fileIndex, error: error.message });
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    if (error instanceof RangeNotSatisfiableError) {
      reqLogger.warn('Range not satisfiable', { infohash, fileIndex, error: error.message });
      return NextResponse.json(
        { error: error.message },
        { status: 416 }
      );
    }

    if (error instanceof StreamingError) {
      reqLogger.error('Streaming error', error, { infohash, fileIndex });
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    reqLogger.error('Unexpected streaming error', error, { infohash, fileIndex });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/stream
 * Get file info without streaming
 * FREE - No authentication required.
 */
export async function HEAD(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  const { searchParams } = new URL(request.url);
  const validation = validateParams(searchParams);

  if ('error' in validation) {
    reqLogger.warn('Invalid HEAD request', { error: validation.error });
    return new Response(null, { status: validation.status });
  }

  const { infohash, fileIndex } = validation;
  const magnetUri = await getMagnetUri(infohash);

  reqLogger.info('HEAD /api/stream', { infohash, fileIndex });

  try {
    const service = getStreamingService();
    reqLogger.debug('Getting stream info');
    const info = await service.getStreamInfo({ magnetUri, fileIndex });

    reqLogger.info('Stream info retrieved', {
      fileName: info.fileName,
      size: info.size,
      mimeType: info.mimeType,
      mediaCategory: info.mediaCategory
    });

    // CORS headers for cross-origin audio/video playback (required for iOS Safari)
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': info.mimeType,
        'Content-Length': info.size.toString(),
        'Accept-Ranges': 'bytes',
        'X-Media-Category': info.mediaCategory,
        'X-File-Name': encodeURIComponent(info.fileName),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      },
    });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      reqLogger.warn('File not found (HEAD)', { infohash, fileIndex });
      return new Response(null, { status: 404 });
    }

    if (error instanceof StreamingError) {
      reqLogger.error('Streaming error (HEAD)', error, { infohash, fileIndex });
      return new Response(null, { status: 500 });
    }

    reqLogger.error('Unexpected error in HEAD', error, { infohash, fileIndex });
    return new Response(null, { status: 500 });
  }
}

/**
 * OPTIONS /api/stream
 * Handle CORS preflight requests
 * Required for iOS Safari cross-origin audio/video playback
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
    },
  });
}
