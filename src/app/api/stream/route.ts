/**
 * Streaming API Route
 *
 * Provides HTTP streaming for audio, video, and ebook files from torrents.
 * Supports HTTP range requests for seeking.
 *
 * FREE - No authentication required to encourage usage.
 *
 * GET /api/stream?infohash=...&fileIndex=...
 * HEAD /api/stream?infohash=...&fileIndex=...
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  StreamingService,
  StreamingError,
  FileNotFoundError,
  RangeNotSatisfiableError,
} from '@/lib/streaming';
import { createLogger, generateRequestId } from '@/lib/logger';

const logger = createLogger('API:stream');

// Singleton streaming service instance
let streamingService: StreamingService | null = null;

function getStreamingService(): StreamingService {
  if (!streamingService) {
    logger.info('Creating new StreamingService instance');
    streamingService = new StreamingService({
      maxConcurrentStreams: 10,
      streamTimeout: 30000,
    });
  }
  return streamingService;
}

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
): { infohash: string; fileIndex: number } | { error: string; status: number } {
  const infohash = searchParams.get('infohash');
  const fileIndexStr = searchParams.get('fileIndex');

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

  return { infohash, fileIndex };
}

/**
 * Build magnet URI from infohash
 */
function buildMagnetUri(infohash: string): string {
  return `magnet:?xt=urn:btih:${infohash}`;
}

/**
 * Convert Node.js Readable stream to Web ReadableStream
 */
function nodeStreamToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err: Error) => {
        controller.error(err);
      });
    },
    cancel() {
      if ('destroy' in nodeStream && typeof nodeStream.destroy === 'function') {
        nodeStream.destroy();
      }
    },
  });
}

/**
 * GET /api/stream
 * Stream a file from a torrent
 * FREE - No authentication required.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.child({ requestId });
  
  const { searchParams } = new URL(request.url);
  const validation = validateParams(searchParams);

  if ('error' in validation) {
    reqLogger.warn('Invalid stream request', { error: validation.error });
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { infohash, fileIndex } = validation;
  const magnetUri = buildMagnetUri(infohash);
  const rangeHeader = request.headers.get('Range');

  reqLogger.info('GET /api/stream', { 
    infohash, 
    fileIndex, 
    hasRange: !!rangeHeader,
    rangeHeader 
  });

  try {
    const service = getStreamingService();

    // If range header present, we need to get file info first to parse the range
    let range: { start: number; end: number } | undefined;
    if (rangeHeader) {
      reqLogger.debug('Getting stream info for range request');
      const info = await service.getStreamInfo({ magnetUri, fileIndex });
      reqLogger.debug('Stream info retrieved', { 
        size: info.size, 
        mimeType: info.mimeType 
      });
      
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

    const headers: HeadersInit = {
      'Content-Type': result.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'X-Stream-Id': result.streamId,
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
  const magnetUri = buildMagnetUri(infohash);

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

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': info.mimeType,
        'Content-Length': info.size.toString(),
        'Accept-Ranges': 'bytes',
        'X-Media-Category': info.mediaCategory,
        'X-File-Name': encodeURIComponent(info.fileName),
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
