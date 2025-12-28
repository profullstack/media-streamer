/**
 * IPTV Proxy API Route Tests
 *
 * Tests for the HTTP-to-HTTPS proxy endpoint that allows
 * IPTV streams served over HTTP to be played on HTTPS pages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

describe('IPTV Proxy API - GET /api/iptv-proxy', () => {
  // Store original fetch
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  describe('Parameter Validation', () => {
    it('should return 400 when url parameter is missing', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/iptv-proxy');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('url');
    });

    it('should return 400 when url is empty', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/iptv-proxy?url=');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('url');
    });

    it('should return 400 for invalid URL format', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('not-a-valid-url')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });

    it('should return 400 for non-HTTP/HTTPS protocols', async () => {
      const { GET } = await import('./route');
      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('rtmp://example.com/stream')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });
  });

  describe('Security Validation', () => {
    it('should block localhost URLs in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.resetModules();
      const { GET } = await import('./route');

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://localhost/stream.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });

    it('should block private IP ranges in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.resetModules();
      const { GET } = await import('./route');

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://192.168.1.1/stream.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid');
    });

    it('should allow localhost URLs in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.resetModules();
      const { GET } = await import('./route');

      // Mock successful fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('#EXTM3U\n'));
            controller.close();
          },
        }),
        text: async () => '#EXTM3U\n',
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://localhost/stream.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Successful Proxying', () => {
    it('should proxy HTTP stream and return content', async () => {
      const { GET } = await import('./route');
      const streamContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
          'content-length': String(streamContent.length),
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamContent));
            controller.close();
          },
        }),
        text: async () => streamContent,
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/stream.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    });

    it('should include CORS headers in response', async () => {
      const { GET } = await import('./route');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'video/mp2t',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/segment.ts')}`
      );
      const response = await GET(request);

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    });

    it('should forward custom headers to upstream', async () => {
      const { GET } = await import('./route');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        text: async () => '',
      });

      const customHeaders = { 'X-Custom-Header': 'test-value' };
      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/stream.m3u8')}&headers=${encodeURIComponent(JSON.stringify(customHeaders))}`
      );
      await GET(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/stream.m3u8',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test-value',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should return 502 when upstream returns error', async () => {
      const { GET } = await import('./route');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/notfound.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain('Upstream');
    });

    it('should return 504 when upstream times out', async () => {
      const { GET } = await import('./route');
      const abortError = new Error('timeout');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/slow.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(504);
      const data = await response.json();
      expect(data.error).toContain('timeout');
    });

    it('should return 504 for network errors', async () => {
      const { GET } = await import('./route');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/stream.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(504);
    });
  });

  describe('HLS Playlist Rewriting', () => {
    it('should rewrite HTTP URLs in HLS playlist to use proxy', async () => {
      const { GET } = await import('./route');
      const originalPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1000000
http://example.com/stream/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000
http://example.com/stream/480p.m3u8
`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(originalPlaylist));
            controller.close();
          },
        }),
        text: async () => originalPlaylist,
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/master.m3u8')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.text();
      // HTTP URLs in playlist should be rewritten to use proxy
      expect(body).toContain('/api/iptv-proxy?url=');
      expect(body).not.toContain('http://example.com/stream/720p.m3u8');
    });

    it('should preserve HTTPS URLs in HLS playlist', async () => {
      const { GET } = await import('./route');
      const originalPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1000000
https://secure.example.com/stream/720p.m3u8
`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(originalPlaylist));
            controller.close();
          },
        }),
        text: async () => originalPlaylist,
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/master.m3u8')}`
      );
      const response = await GET(request);

      const body = await response.text();
      // HTTPS URLs should remain unchanged
      expect(body).toContain('https://secure.example.com/stream/720p.m3u8');
    });

    it('should handle relative URLs in HLS playlist', async () => {
      const { GET } = await import('./route');
      const originalPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10,
segment001.ts
#EXTINF:10,
segment002.ts
`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.apple.mpegurl',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(originalPlaylist));
            controller.close();
          },
        }),
        text: async () => originalPlaylist,
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/live/playlist.m3u8')}`
      );
      const response = await GET(request);

      const body = await response.text();
      // Relative URLs should be converted to absolute and proxied
      expect(body).toContain('/api/iptv-proxy?url=');
      expect(body).toContain(encodeURIComponent('http://example.com/live/segment001.ts'));
    });
  });

  describe('Content Type Handling', () => {
    it('should pass through video/mp2t content without modification', async () => {
      const { GET } = await import('./route');
      const tsContent = new Uint8Array([0x47, 0x40, 0x00, 0x10]); // TS sync byte
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'video/mp2t',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(tsContent);
            controller.close();
          },
        }),
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/segment.ts')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('video/mp2t');
    });

    it('should handle application/octet-stream content type', async () => {
      const { GET } = await import('./route');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/octet-stream',
        }),
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const request = new NextRequest(
        `http://localhost/api/iptv-proxy?url=${encodeURIComponent('http://example.com/data.bin')}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
    });
  });
});

describe('IPTV Proxy API - OPTIONS /api/iptv-proxy', () => {
  it('should return CORS headers for preflight requests', async () => {
    const { OPTIONS } = await import('./route');
    const request = new NextRequest('http://localhost/api/iptv-proxy', {
      method: 'OPTIONS',
    });
    const response = await OPTIONS(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    expect(response.headers.get('access-control-allow-headers')).toBeDefined();
  });
});
