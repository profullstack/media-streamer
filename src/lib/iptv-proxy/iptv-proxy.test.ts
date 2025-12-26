/**
 * IPTV Proxy Tests
 * 
 * TDD tests for proxying HTTP streams to avoid mixed content errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldProxy,
  createProxyUrl,
  parseProxyUrl,
  validateStreamUrl,
  getStreamHeaders,
  buildProxyHeaders,
  isHttpUrl,
  isHttpsUrl,
  sanitizeUrl,
  encodeStreamUrl,
  decodeStreamUrl,
  ProxyConfig,
  ProxyRequest,
  StreamInfo,
} from './iptv-proxy';

describe('IPTV Proxy', () => {
  describe('URL Protocol Detection', () => {
    it('should detect HTTP URLs', () => {
      expect(isHttpUrl('http://example.com/stream.m3u8')).toBe(true);
      expect(isHttpUrl('HTTP://example.com/stream.m3u8')).toBe(true);
      expect(isHttpUrl('https://example.com/stream.m3u8')).toBe(false);
      expect(isHttpUrl('rtmp://example.com/stream')).toBe(false);
    });

    it('should detect HTTPS URLs', () => {
      expect(isHttpsUrl('https://example.com/stream.m3u8')).toBe(true);
      expect(isHttpsUrl('HTTPS://example.com/stream.m3u8')).toBe(true);
      expect(isHttpsUrl('http://example.com/stream.m3u8')).toBe(false);
    });
  });

  describe('Proxy Decision', () => {
    it('should proxy HTTP URLs when on HTTPS page', () => {
      expect(shouldProxy('http://example.com/stream.m3u8', true)).toBe(true);
    });

    it('should not proxy HTTPS URLs', () => {
      expect(shouldProxy('https://example.com/stream.m3u8', true)).toBe(false);
      expect(shouldProxy('https://example.com/stream.m3u8', false)).toBe(false);
    });

    it('should not proxy HTTP URLs when on HTTP page', () => {
      expect(shouldProxy('http://example.com/stream.m3u8', false)).toBe(false);
    });

    it('should not proxy non-HTTP protocols', () => {
      expect(shouldProxy('rtmp://example.com/stream', true)).toBe(false);
      expect(shouldProxy('rtsp://example.com/stream', true)).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      expect(shouldProxy('', true)).toBe(false);
      expect(shouldProxy('not-a-url', true)).toBe(false);
    });
  });

  describe('Proxy URL Creation', () => {
    it('should create proxy URL with encoded stream URL', () => {
      const streamUrl = 'http://example.com/stream.m3u8';
      const proxyUrl = createProxyUrl(streamUrl, '/api/iptv-proxy');

      expect(proxyUrl).toContain('/api/iptv-proxy');
      expect(proxyUrl).toContain('url=');
    });

    it('should encode special characters in URL', () => {
      const streamUrl = 'http://example.com/stream.m3u8?token=abc&quality=hd';
      const proxyUrl = createProxyUrl(streamUrl, '/api/iptv-proxy');

      // The URL should not contain raw & or ? from the stream URL
      expect(proxyUrl).not.toContain('&quality');
      expect(proxyUrl).not.toContain('?token');
      // Should be able to parse back the original URL
      const parsed = parseProxyUrl(proxyUrl);
      expect(parsed.streamUrl).toBe(streamUrl);
    });

    it('should include optional headers in proxy URL', () => {
      const streamUrl = 'http://example.com/stream.m3u8';
      const headers = { 'User-Agent': 'CustomAgent' };
      const proxyUrl = createProxyUrl(streamUrl, '/api/iptv-proxy', { headers });

      expect(proxyUrl).toContain('headers=');
    });
  });

  describe('Proxy URL Parsing', () => {
    it('should parse proxy URL and extract stream URL', () => {
      const originalUrl = 'http://example.com/stream.m3u8';
      const proxyUrl = createProxyUrl(originalUrl, '/api/iptv-proxy');
      const parsed = parseProxyUrl(proxyUrl);

      expect(parsed.streamUrl).toBe(originalUrl);
    });

    it('should extract headers from proxy URL', () => {
      const originalUrl = 'http://example.com/stream.m3u8';
      const headers = { 'User-Agent': 'CustomAgent' };
      const proxyUrl = createProxyUrl(originalUrl, '/api/iptv-proxy', { headers });
      const parsed = parseProxyUrl(proxyUrl);

      expect(parsed.headers).toEqual(headers);
    });

    it('should handle proxy URL without headers', () => {
      const originalUrl = 'http://example.com/stream.m3u8';
      const proxyUrl = createProxyUrl(originalUrl, '/api/iptv-proxy');
      const parsed = parseProxyUrl(proxyUrl);

      expect(parsed.headers).toEqual({});
    });
  });

  describe('Stream URL Validation', () => {
    it('should validate correct stream URLs', () => {
      expect(validateStreamUrl('http://example.com/stream.m3u8')).toBe(true);
      expect(validateStreamUrl('https://example.com/stream.ts')).toBe(true);
      expect(validateStreamUrl('http://192.168.1.1:8080/live/stream')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateStreamUrl('')).toBe(false);
      expect(validateStreamUrl('not-a-url')).toBe(false);
      expect(validateStreamUrl('ftp://example.com/file')).toBe(false);
    });

    it('should reject localhost URLs in production', () => {
      expect(validateStreamUrl('http://localhost/stream', true)).toBe(false);
      expect(validateStreamUrl('http://127.0.0.1/stream', true)).toBe(false);
    });

    it('should allow localhost URLs in development', () => {
      expect(validateStreamUrl('http://localhost/stream', false)).toBe(true);
      expect(validateStreamUrl('http://127.0.0.1/stream', false)).toBe(true);
    });

    it('should reject private IP ranges in production', () => {
      expect(validateStreamUrl('http://192.168.1.1/stream', true)).toBe(false);
      expect(validateStreamUrl('http://10.0.0.1/stream', true)).toBe(false);
      expect(validateStreamUrl('http://172.16.0.1/stream', true)).toBe(false);
    });
  });

  describe('Stream Headers', () => {
    it('should return default headers for stream requests', () => {
      const headers = getStreamHeaders();

      expect(headers['User-Agent']).toBeDefined();
      expect(headers['Accept']).toBeDefined();
    });

    it('should merge custom headers with defaults', () => {
      const customHeaders = { 'X-Custom': 'value' };
      const headers = getStreamHeaders(customHeaders);

      expect(headers['User-Agent']).toBeDefined();
      expect(headers['X-Custom']).toBe('value');
    });

    it('should allow overriding default headers', () => {
      const customHeaders = { 'User-Agent': 'MyCustomAgent' };
      const headers = getStreamHeaders(customHeaders);

      expect(headers['User-Agent']).toBe('MyCustomAgent');
    });
  });

  describe('Proxy Headers', () => {
    it('should build appropriate proxy response headers', () => {
      const streamInfo: StreamInfo = {
        contentType: 'application/vnd.apple.mpegurl',
        contentLength: 1024,
      };

      const headers = buildProxyHeaders(streamInfo);

      expect(headers['Content-Type']).toBe('application/vnd.apple.mpegurl');
      expect(headers['Content-Length']).toBe('1024');
    });

    it('should include CORS headers', () => {
      const headers = buildProxyHeaders({});

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Access-Control-Allow-Methods']).toBeDefined();
    });

    it('should include cache control headers', () => {
      const headers = buildProxyHeaders({});

      expect(headers['Cache-Control']).toBeDefined();
    });

    it('should handle missing content info', () => {
      const headers = buildProxyHeaders({});

      expect(headers['Content-Type']).toBe('application/octet-stream');
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize URLs by removing dangerous characters', () => {
      const url = 'http://example.com/stream<script>alert(1)</script>.m3u8';
      const sanitized = sanitizeUrl(url);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should preserve valid URL characters', () => {
      const url = 'http://example.com/stream.m3u8?token=abc123&quality=hd';
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe(url);
    });

    it('should handle empty strings', () => {
      expect(sanitizeUrl('')).toBe('');
    });

    it('should trim whitespace', () => {
      const url = '  http://example.com/stream.m3u8  ';
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toBe('http://example.com/stream.m3u8');
    });
  });

  describe('URL Encoding/Decoding', () => {
    it('should encode stream URL for safe transmission', () => {
      const url = 'http://example.com/stream.m3u8?token=abc&quality=hd';
      const encoded = encodeStreamUrl(url);

      expect(encoded).not.toContain('?');
      expect(encoded).not.toContain('&');
    });

    it('should decode encoded stream URL', () => {
      const original = 'http://example.com/stream.m3u8?token=abc&quality=hd';
      const encoded = encodeStreamUrl(original);
      const decoded = decodeStreamUrl(encoded);

      expect(decoded).toBe(original);
    });

    it('should handle special characters', () => {
      const url = 'http://example.com/stream.m3u8?name=Test%20Stream';
      const encoded = encodeStreamUrl(url);
      const decoded = decodeStreamUrl(encoded);

      expect(decoded).toBe(url);
    });

    it('should handle unicode characters', () => {
      const url = 'http://example.com/日本語.m3u8';
      const encoded = encodeStreamUrl(url);
      const decoded = decodeStreamUrl(encoded);

      expect(decoded).toBe(url);
    });
  });

  describe('Proxy Configuration', () => {
    it('should create default proxy config', () => {
      const config: ProxyConfig = {
        enabled: true,
        baseUrl: '/api/iptv-proxy',
        timeout: 30000,
        maxRetries: 3,
      };

      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30000);
    });

    it('should validate proxy config', () => {
      const validConfig: ProxyConfig = {
        enabled: true,
        baseUrl: '/api/iptv-proxy',
        timeout: 30000,
        maxRetries: 3,
      };

      expect(validConfig.baseUrl).toMatch(/^\/api\//);
    });
  });

  describe('Proxy Request', () => {
    it('should create proxy request object', () => {
      const request: ProxyRequest = {
        streamUrl: 'http://example.com/stream.m3u8',
        headers: { 'User-Agent': 'Test' },
        timeout: 30000,
      };

      expect(request.streamUrl).toBeDefined();
      expect(request.headers).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle URLs with authentication', () => {
      const url = 'http://user:pass@example.com/stream.m3u8';
      expect(validateStreamUrl(url)).toBe(true);
      
      const encoded = encodeStreamUrl(url);
      const decoded = decodeStreamUrl(encoded);
      expect(decoded).toBe(url);
    });

    it('should handle URLs with ports', () => {
      const url = 'http://example.com:8080/stream.m3u8';
      expect(validateStreamUrl(url)).toBe(true);
    });

    it('should handle URLs with fragments', () => {
      const url = 'http://example.com/stream.m3u8#segment1';
      const encoded = encodeStreamUrl(url);
      const decoded = decodeStreamUrl(encoded);
      expect(decoded).toBe(url);
    });

    it('should handle very long URLs', () => {
      const longPath = 'a'.repeat(1000);
      const url = `http://example.com/${longPath}.m3u8`;
      
      const encoded = encodeStreamUrl(url);
      const decoded = decodeStreamUrl(encoded);
      expect(decoded).toBe(url);
    });

    it('should handle empty headers object', () => {
      const headers = getStreamHeaders({});
      expect(headers['User-Agent']).toBeDefined();
    });
  });
});
