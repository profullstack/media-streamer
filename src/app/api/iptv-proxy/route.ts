/**
 * IPTV Proxy API Route
 *
 * GET /api/iptv-proxy?url=<encoded-url>&headers=<encoded-headers>
 *
 * Proxies HTTP streams to avoid mixed content errors on HTTPS pages.
 * This is necessary because many IPTV providers serve streams over HTTP,
 * which browsers block when the page is served over HTTPS.
 *
 * Features:
 * - Proxies HTTP streams through HTTPS
 * - Rewrites HLS playlists to proxy all HTTP URLs
 * - Forwards custom headers to upstream
 * - Blocks private IPs in production for security
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateStreamUrl,
  getStreamHeaders,
  buildProxyHeaders,
  decodeStreamUrl,
  isHttpUrl,
  encodeStreamUrl,
} from '@/lib/iptv-proxy';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 30000;

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
 *
 * @param content - The HLS playlist content
 * @param baseUrl - The base URL for resolving relative URLs
 * @param proxyBaseUrl - The proxy API base URL
 * @returns The rewritten playlist content
 */
function rewriteHlsPlaylist(
  content: string,
  baseUrl: string,
  proxyBaseUrl: string
): string {
  const lines = content.split('\n');
  const rewrittenLines: string[] = [];

  // Parse base URL for resolving relative paths
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return content; // Return unchanged if base URL is invalid
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments (except URI in comments)
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      // Check for URI= in EXT-X-KEY or similar tags
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

    // Check if line is a URL (not a tag)
    if (!trimmedLine.startsWith('#')) {
      const absoluteUrl = resolveUrl(trimmedLine, parsedBase);

      // Only proxy HTTP URLs, leave HTTPS unchanged
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
  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Absolute path
  if (url.startsWith('/')) {
    return `${base.protocol}//${base.host}${url}`;
  }

  // Relative path - resolve against base directory
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
 * GET /api/iptv-proxy
 *
 * Proxy an HTTP stream through HTTPS.
 *
 * Query parameters:
 * - url: (required) The encoded stream URL to proxy
 * - headers: (optional) Encoded JSON object of custom headers
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const encodedUrl = searchParams.get('url');
  const encodedHeaders = searchParams.get('headers');

  // Validate URL parameter
  if (!encodedUrl) {
    return NextResponse.json(
      { error: 'Missing required parameter: url' },
      { status: 400 }
    );
  }

  // Decode the stream URL
  const streamUrl = decodeStreamUrl(encodedUrl);

  if (!streamUrl) {
    return NextResponse.json(
      { error: 'Invalid url parameter' },
      { status: 400 }
    );
  }

  // Validate the stream URL
  if (!validateStreamUrl(streamUrl, isProduction())) {
    return NextResponse.json(
      { error: 'Invalid stream URL' },
      { status: 400 }
    );
  }

  // Parse custom headers if provided
  let customHeaders: Record<string, string> = {};
  if (encodedHeaders) {
    try {
      customHeaders = JSON.parse(decodeStreamUrl(encodedHeaders)) as Record<string, string>;
    } catch {
      // Ignore invalid headers
    }
  }

  // Build request headers
  const requestHeaders = getStreamHeaders(customHeaders);

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Fetch the upstream stream
    const response = await fetch(streamUrl, {
      headers: requestHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for upstream errors
    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    // Get content type
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    // Build proxy response headers
    const proxyHeaders = buildProxyHeaders({
      contentType: contentType ?? undefined,
      contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
    });

    // For HLS playlists, rewrite HTTP URLs to use proxy
    if (isHlsPlaylist(contentType) && response.body) {
      const text = await response.text();
      const proxyBaseUrl = '/api/iptv-proxy';
      const rewrittenContent = rewriteHlsPlaylist(text, streamUrl, proxyBaseUrl);

      return new Response(rewrittenContent, {
        status: 200,
        headers: {
          ...proxyHeaders,
          'Content-Length': String(new TextEncoder().encode(rewrittenContent).length),
        },
      });
    }

    // For other content types, stream through directly
    return new Response(response.body, {
      status: 200,
      headers: proxyHeaders,
    });
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 504 }
      );
    }

    // Handle other errors
    console.error('[IPTV Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Proxy error: timeout or network failure' },
      { status: 504 }
    );
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
      'Access-Control-Max-Age': '86400',
    },
  });
}
