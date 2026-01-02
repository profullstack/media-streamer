/**
 * IPTV Proxy API Route
 *
 * GET /api/iptv-proxy?url=<encoded-url>&headers=<encoded-headers>
 *
 * Proxies HTTP streams to avoid mixed content errors on HTTPS pages.
 * Uses native Web Streams API for true streaming without buffering.
 *
 * Features:
 * - True streaming proxy using ReadableStream
 * - Proxies HTTP streams through HTTPS
 * - Rewrites HLS playlists to proxy all HTTP URLs
 * - Forwards custom headers to upstream
 * - Supports Range requests for seeking
 * - Blocks private IPs in production for security
 * - Skips SSL certificate validation for IPTV providers with misconfigured certs
 */

import { NextRequest } from 'next/server';
import { Agent, fetch as undiciFetch } from 'undici';
import {
  validateStreamUrl,
  getStreamHeaders,
  decodeStreamUrl,
  isHttpUrl,
  encodeStreamUrl,
} from '@/lib/iptv-proxy';

/**
 * Custom undici Agent that skips SSL certificate validation.
 * This is necessary because many IPTV providers have misconfigured SSL certificates.
 * WARNING: This disables certificate validation for all IPTV proxy requests.
 */
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

/**
 * Request timeout in milliseconds (longer for live streams)
 */
const REQUEST_TIMEOUT = 120000;

/**
 * HLS content types that need URL rewriting
 */
const HLS_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
];

/**
 * Check if content type is HLS playlist
 */
function isHlsPlaylist(contentType: string | null): boolean {
  if (!contentType) return false;
  const lowerType = contentType.toLowerCase().split(';')[0].trim();
  return HLS_CONTENT_TYPES.includes(lowerType);
}

/**
 * Rewrite HTTP URLs in HLS playlist to use proxy
 */
function rewriteHlsPlaylist(
  content: string,
  baseUrl: string,
  proxyBaseUrl: string
): string {
  const lines = content.split('\n');
  const rewrittenLines: string[] = [];

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return content;
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      if (trimmedLine.includes('URI="')) {
        const rewrittenTag = trimmedLine.replace(
          /URI="([^"]+)"/g,
          (_match, uri: string) => {
            const absoluteUrl = resolveUrl(uri, parsedBase);
            if (isHttpUrl(absoluteUrl)) {
              return `URI="${proxyBaseUrl}?url=${encodeStreamUrl(absoluteUrl)}"`;
            }
            return `URI="${absoluteUrl}"`;
          }
        );
        rewrittenLines.push(rewrittenTag);
      } else {
        rewrittenLines.push(line);
      }
      continue;
    }

    if (!trimmedLine.startsWith('#')) {
      const absoluteUrl = resolveUrl(trimmedLine, parsedBase);
      if (isHttpUrl(absoluteUrl)) {
        rewrittenLines.push(`${proxyBaseUrl}?url=${encodeStreamUrl(absoluteUrl)}`);
      } else {
        rewrittenLines.push(absoluteUrl);
      }
    } else {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

/**
 * Resolve a URL against a base URL
 */
function resolveUrl(url: string, base: URL): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${base.protocol}//${base.host}${url}`;
  }
  const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
  return `${base.protocol}//${base.host}${basePath}${url}`;
}

/**
 * Check if running in production
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Create a JSON error response using native Response
 */
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * GET /api/iptv-proxy
 *
 * Proxy an HTTP stream through HTTPS using native streaming.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const encodedUrl = searchParams.get('url');
  const encodedHeaders = searchParams.get('headers');

  console.log('[IPTV Proxy] Request received');

  // Validate URL parameter
  if (!encodedUrl) {
    return jsonError('Missing required parameter: url', 400);
  }

  // Decode the stream URL
  const streamUrl = decodeStreamUrl(encodedUrl);
  console.log('[IPTV Proxy] Decoded URL:', streamUrl?.substring(0, 100));

  if (!streamUrl) {
    return jsonError('Invalid url parameter', 400);
  }

  // Validate the stream URL
  if (!validateStreamUrl(streamUrl, isProduction())) {
    return jsonError('Invalid stream URL', 400);
  }

  // Parse custom headers if provided
  let customHeaders: Record<string, string> = {};
  if (encodedHeaders) {
    try {
      const decoded = decodeStreamUrl(encodedHeaders);
      if (decoded) {
        customHeaders = JSON.parse(decoded) as Record<string, string>;
      }
    } catch {
      // Ignore invalid headers
    }
  }

  // Build request headers
  const requestHeaders = getStreamHeaders(customHeaders);

  // Forward Range header for seeking support
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    requestHeaders['Range'] = rangeHeader;
  }

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Fetch the upstream stream using undici with insecure agent
    // This skips SSL certificate validation for IPTV providers with misconfigured certs
    const upstreamResponse = await undiciFetch(streamUrl, {
      headers: requestHeaders,
      signal: controller.signal,
      dispatcher: insecureAgent,
    });

    clearTimeout(timeoutId);

    // Check for upstream errors (allow 206 Partial Content for Range requests)
    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      console.log('[IPTV Proxy] Upstream error:', upstreamResponse.status);
      return jsonError(`Upstream error: ${upstreamResponse.status}`, 502);
    }

    // Get content type and other headers
    const contentType = upstreamResponse.headers.get('content-type');
    const contentLength = upstreamResponse.headers.get('content-length');
    const contentRange = upstreamResponse.headers.get('content-range');
    const acceptRanges = upstreamResponse.headers.get('accept-ranges');

    // Build response headers
    const responseHeaders: HeadersInit = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Connection': 'keep-alive',
    };

    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }

    if (acceptRanges) {
      responseHeaders['Accept-Ranges'] = acceptRanges;
    }

    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    // For HLS playlists, rewrite HTTP URLs to use proxy
    if (isHlsPlaylist(contentType) && upstreamResponse.body) {
      const text = await upstreamResponse.text();
      const proxyBaseUrl = '/api/iptv-proxy';
      const rewrittenContent = rewriteHlsPlaylist(text, streamUrl, proxyBaseUrl);
      const encoded = new TextEncoder().encode(rewrittenContent);

      return new Response(encoded, {
        status: 200,
        headers: {
          ...responseHeaders,
          'Content-Length': String(encoded.length),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Detect if this is a live stream
    const isLiveStream = streamUrl.endsWith('.ts') ||
                         contentType?.includes('video/mp2t') ||
                         contentType?.includes('video/mpeg');

    // For live streams, don't set Content-Length to enable true streaming
    if (!isLiveStream && contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    // Add cache control for live streams
    if (isLiveStream) {
      responseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      console.log('[IPTV Proxy] Live stream detected, streaming directly');
    }

    // Return the upstream body directly as a ReadableStream
    // Convert undici's ReadableStream to a web-compatible ReadableStream
    // by casting through unknown (undici's stream is compatible at runtime)
    const body = upstreamResponse.body as unknown as ReadableStream<Uint8Array> | null;
    return new Response(body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[IPTV Proxy] Request timeout');
      return jsonError('Request timeout', 504);
    }

    console.error('[IPTV Proxy] Error:', error);
    return jsonError('Proxy error', 504);
  }
}

/**
 * OPTIONS /api/iptv-proxy
 *
 * Handle CORS preflight requests.
 */
export async function OPTIONS(_request: NextRequest): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
    },
  });
}
