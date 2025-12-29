/**
 * Streaming API Route
 *
 * Provides HTTP streaming for audio, video, and ebook files from torrents.
 * Supports HTTP range requests for seeking.
 * Supports automatic transcoding for non-browser-supported formats.
 *
 * FREE - No authentication required to encourage usage.
 *
 * GET /api/stream?infohash=...&fileIndex=...&transcode=auto
 * HEAD /api/stream?infohash=...&fileIndex=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
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
): { infohash: string; fileIndex: number; transcode: string | null } | { error: string; status: number } {
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');
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

  return { infohash, fileIndex, transcode };
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
  
  // Create a promise that resolves when pre-buffer is ready
  const preBufferReady = new Promise<void>((resolve) => {
    preBufferResolver = resolve;
  });
  
  return new ReadableStream({
    async start(controller) {
      // Set up timeout for pre-buffer
      preBufferTimeout = setTimeout(() => {
        if (!preBufferComplete) {
          reqLogger.info('Pre-buffer timeout reached, starting playback', {
            bufferedBytes: preBufferSize,
            targetBytes: preBufferBytes,
            timeoutMs: preBufferTimeoutMs,
          });
          preBufferComplete = true;
          preBufferResolver?.();
        }
      }, preBufferTimeoutMs);
      
      nodeStream.on('data', (chunk: Buffer) => {
        if (controllerClosed) return;
        
        if (!preBufferComplete) {
          // Still collecting pre-buffer
          preBuffer.push(chunk);
          preBufferSize += chunk.length;
          
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
      });
      
      nodeStream.on('end', () => {
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
      });
      
      nodeStream.on('error', (err: Error) => {
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
      });
      
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
 */
function createTranscodedStream(
  sourceStream: NodeJS.ReadableStream,
  fileName: string,
  reqLogger: ReturnType<typeof logger.child>
): { stream: NodeJS.ReadableStream; mimeType: string } | null {
  try {
    const mediaType = detectMediaType(fileName);
    if (!mediaType) {
      reqLogger.warn('Cannot detect media type for transcoding', { fileName });
      return null;
    }

    // Extract format from filename
    const format = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!format) {
      reqLogger.warn('Cannot extract format from filename', { fileName });
      return null;
    }

    const profile = getStreamingTranscodeProfile(mediaType, format);
    if (!profile) {
      reqLogger.warn('No transcoding profile available', { fileName, mediaType, format });
      return null;
    }

    // Pass the input format to FFmpeg args builder for proper container detection
    // This is critical for non-seekable streams like MKV where metadata is at the end
    const ffmpegArgs = buildStreamingFFmpegArgs(profile, format);
    const outputMimeType = getTranscodedMimeType(mediaType, format);
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
    try {
      ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
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

    const safeDestroyOutput = (err?: Error): void => {
      if (!outputDestroyed) {
        outputDestroyed = true;
        try {
          if (err) {
            outputStream.destroy(err);
          } else {
            outputStream.destroy();
          }
        } catch (destroyError) {
          reqLogger.debug('Error destroying output stream', { error: String(destroyError) });
        }
      }
    };

    // Pipe source stream to FFmpeg stdin with error handling
    try {
      sourceStream.pipe(ffmpeg.stdin);
    } catch (pipeError) {
      reqLogger.error('Failed to pipe source to FFmpeg stdin', pipeError);
      safeKillFFmpeg();
      return null;
    }

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
    let stderrBuffer = '';
    ffmpeg.stderr.on('data', (data: Buffer) => {
      try {
        stderrBuffer += data.toString();
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
 * - transcode: 'auto' to automatically transcode non-browser formats (optional)
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

  const { infohash, fileIndex, transcode } = validation;
  
  reqLogger.info('Stream request validated', {
    infohash,
    fileIndex,
    transcode,
  });
  
  const magnetUri = await getMagnetUri(infohash);
  const rangeHeader = request.headers.get('Range');

  reqLogger.info('GET /api/stream', {
    infohash,
    fileIndex,
    hasRange: !!rangeHeader,
    rangeHeader,
    transcode,
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

    // Check if transcoding is requested and needed
    const shouldTranscode = transcode === 'auto' && needsTranscoding(info.fileName);
    
    reqLogger.info('Transcoding decision', {
      transcode,
      fileName: info.fileName,
      needsTranscoding: needsTranscoding(info.fileName),
      shouldTranscode,
    });
    
    if (shouldTranscode) {
      reqLogger.info('=== STARTING TRANSCODING PATH ===', {
        fileName: info.fileName,
        originalMimeType: info.mimeType,
        fileSize: info.size,
      });

      // For transcoding, we don't support range requests (transcoded output has unknown size)
      // We need to wait for initial data because FFmpeg needs the file headers to start transcoding
      // Without waiting, FFmpeg may receive empty data and fail to detect the input format
      reqLogger.debug('Creating stream for transcoding (waiting for initial data)');
      const result = await service.createStream({
        magnetUri,
        fileIndex,
        range: undefined,
      }, false); // skipWaitForData = false - FFmpeg needs the beginning of the file

      const transcoded = createTranscodedStream(
        result.stream as NodeJS.ReadableStream,
        info.fileName,
        reqLogger
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
