/**
 * Streaming API Route
 * 
 * Provides HTTP streaming for audio, video, and ebook files from torrents.
 * Supports HTTP range requests for seeking.
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

// Singleton streaming service instance
let streamingService: StreamingService | null = null;

function getStreamingService(): StreamingService {
  if (!streamingService) {
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
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const validation = validateParams(searchParams);

  if ('error' in validation) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { infohash, fileIndex } = validation;
  const magnetUri = buildMagnetUri(infohash);
  const rangeHeader = request.headers.get('Range');

  try {
    const service = getStreamingService();

    // If range header present, we need to get file info first to parse the range
    let range: { start: number; end: number } | undefined;
    if (rangeHeader) {
      const info = await service.getStreamInfo({ magnetUri, fileIndex });
      const parsedRange = parseRangeHeader(rangeHeader, info.size);
      if (parsedRange) {
        range = parsedRange;
      }
    }

    const result = await service.createStream({
      magnetUri,
      fileIndex,
      range,
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

      return new Response(nodeStreamToWebStream(result.stream as NodeJS.ReadableStream), {
        status: 206,
        headers,
      });
    }

    headers['Content-Length'] = result.size.toString();

    return new Response(nodeStreamToWebStream(result.stream as NodeJS.ReadableStream), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    if (error instanceof RangeNotSatisfiableError) {
      return NextResponse.json(
        { error: error.message },
        { status: 416 }
      );
    }

    if (error instanceof StreamingError) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.error('Unexpected streaming error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/stream
 * Get file info without streaming
 */
export async function HEAD(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const validation = validateParams(searchParams);

  if ('error' in validation) {
    return new Response(null, { status: validation.status });
  }

  const { infohash, fileIndex } = validation;
  const magnetUri = buildMagnetUri(infohash);

  try {
    const service = getStreamingService();
    const info = await service.getStreamInfo({ magnetUri, fileIndex });

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
      return new Response(null, { status: 404 });
    }

    if (error instanceof StreamingError) {
      return new Response(null, { status: 500 });
    }

    console.error('Unexpected error in HEAD:', error);
    return new Response(null, { status: 500 });
  }
}
