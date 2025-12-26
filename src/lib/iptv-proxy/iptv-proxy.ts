/**
 * IPTV Proxy Module
 * 
 * Proxies HTTP streams to avoid mixed content errors on HTTPS pages
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  enabled: boolean;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
}

/**
 * Proxy request
 */
export interface ProxyRequest {
  streamUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Stream info for response headers
 */
export interface StreamInfo {
  contentType?: string;
  contentLength?: number;
}

/**
 * Parsed proxy URL result
 */
export interface ParsedProxyUrl {
  streamUrl: string;
  headers: Record<string, string>;
}

/**
 * Create proxy URL options
 */
export interface CreateProxyUrlOptions {
  headers?: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_ACCEPT = '*/*';

// Private IP ranges for validation
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^localhost$/i,
];

// ============================================================================
// URL Protocol Detection
// ============================================================================

/**
 * Check if URL uses HTTP protocol
 */
export function isHttpUrl(url: string): boolean {
  if (!url) return false;
  return url.toLowerCase().startsWith('http://');
}

/**
 * Check if URL uses HTTPS protocol
 */
export function isHttpsUrl(url: string): boolean {
  if (!url) return false;
  return url.toLowerCase().startsWith('https://');
}

// ============================================================================
// Proxy Decision
// ============================================================================

/**
 * Determine if a URL should be proxied
 * 
 * @param url - The stream URL
 * @param isSecurePage - Whether the current page is served over HTTPS
 * @returns true if the URL should be proxied
 */
export function shouldProxy(url: string, isSecurePage: boolean): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Only proxy HTTP URLs
  if (!isHttpUrl(url)) {
    return false;
  }

  // Only need to proxy when on HTTPS page (mixed content)
  return isSecurePage;
}

// ============================================================================
// Proxy URL Creation
// ============================================================================

/**
 * Create a proxy URL for a stream
 * 
 * @param streamUrl - The original stream URL
 * @param baseUrl - The proxy API base URL
 * @param options - Optional headers to include
 * @returns The proxy URL
 */
export function createProxyUrl(
  streamUrl: string,
  baseUrl: string,
  options?: CreateProxyUrlOptions
): string {
  const params = new URLSearchParams();
  params.set('url', encodeStreamUrl(streamUrl));

  if (options?.headers && Object.keys(options.headers).length > 0) {
    params.set('headers', encodeStreamUrl(JSON.stringify(options.headers)));
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Parse a proxy URL to extract the original stream URL and headers
 */
export function parseProxyUrl(proxyUrl: string): ParsedProxyUrl {
  try {
    const url = new URL(proxyUrl, 'http://localhost');
    const encodedUrl = url.searchParams.get('url') ?? '';
    const encodedHeaders = url.searchParams.get('headers');

    const streamUrl = decodeStreamUrl(encodedUrl);
    let headers: Record<string, string> = {};

    if (encodedHeaders) {
      try {
        headers = JSON.parse(decodeStreamUrl(encodedHeaders)) as Record<string, string>;
      } catch {
        headers = {};
      }
    }

    return { streamUrl, headers };
  } catch {
    return { streamUrl: '', headers: {} };
  }
}

// ============================================================================
// Stream URL Validation
// ============================================================================

/**
 * Validate a stream URL
 * 
 * @param url - The URL to validate
 * @param isProduction - Whether running in production (blocks private IPs)
 * @returns true if the URL is valid
 */
export function validateStreamUrl(url: string, isProduction = false): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must be HTTP or HTTPS
  if (!isHttpUrl(url) && !isHttpsUrl(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // In production, block private IPs and localhost
    if (isProduction) {
      const hostname = parsed.hostname;

      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Headers
// ============================================================================

/**
 * Get default headers for stream requests
 */
export function getStreamHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const defaults: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    'Accept': DEFAULT_ACCEPT,
  };

  if (!customHeaders) {
    return defaults;
  }

  return { ...defaults, ...customHeaders };
}

/**
 * Build proxy response headers
 */
export function buildProxyHeaders(streamInfo: StreamInfo): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': streamInfo.contentType ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  if (streamInfo.contentLength !== undefined) {
    headers['Content-Length'] = String(streamInfo.contentLength);
  }

  return headers;
}

// ============================================================================
// URL Sanitization
// ============================================================================

/**
 * Sanitize a URL by removing dangerous characters
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';

  // Trim whitespace
  let sanitized = url.trim();

  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (except for valid data URLs)
  if (sanitized.toLowerCase().startsWith('data:') && !sanitized.toLowerCase().startsWith('data:image/')) {
    sanitized = '';
  }

  return sanitized;
}

// ============================================================================
// URL Encoding/Decoding
// ============================================================================

/**
 * Encode a stream URL for safe transmission
 */
export function encodeStreamUrl(url: string): string {
  return encodeURIComponent(url);
}

/**
 * Decode an encoded stream URL
 */
export function decodeStreamUrl(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
