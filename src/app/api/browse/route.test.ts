/**
 * Browse API Tests
 *
 * Tests for the content type browsing API endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Create a chainable mock that returns itself for all query methods
function createChainableMock() {
  const mockResult = {
    data: [
      {
        id: 'torrent-1',
        infohash: 'abc123',
        name: 'Test Movie 2024',
        total_size: 1000000,
        file_count: 1,
        content_type: 'movie',
        poster_url: 'https://example.com/poster.jpg',
        year: 2024,
        seeders: 100,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    error: null,
    count: 1,
  };

  const chainable: Record<string, unknown> = {};
  
  const methods = ['select', 'eq', 'ilike', 'order', 'range'];
  
  methods.forEach(method => {
    chainable[method] = vi.fn(() => {
      // range is the terminal method that returns the result
      if (method === 'range') {
        return Promise.resolve(mockResult);
      }
      return chainable;
    });
  });

  return chainable;
}

// Mock the Supabase client
vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(function() {
    return {
      from: vi.fn(function() { return createChainableMock(); }),
    };
  }),
  resetServerClient: vi.fn(),
}));

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/browse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should return 400 when contentType is missing', async () => {
      const request = createRequest('/api/browse');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('contentType parameter is required');
    });

    it('should return 400 for invalid contentType', async () => {
      const request = createRequest('/api/browse?contentType=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid contentType');
    });
  });

  describe('content types', () => {
    it('should accept valid contentType: movie', async () => {
      const request = createRequest('/api/browse?contentType=movie');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should accept valid contentType: tvshow', async () => {
      const request = createRequest('/api/browse?contentType=tvshow');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should accept valid contentType: music', async () => {
      const request = createRequest('/api/browse?contentType=music');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should accept valid contentType: book', async () => {
      const request = createRequest('/api/browse?contentType=book');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('pagination', () => {
    it('should return paginated results', async () => {
      const request = createRequest('/api/browse?contentType=movie&limit=10&offset=0');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('torrents');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
    });

    it('should respect limit parameter', async () => {
      const request = createRequest('/api/browse?contentType=movie&limit=25');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.limit).toBe(25);
    });

    it('should cap limit at 100', async () => {
      const request = createRequest('/api/browse?contentType=movie&limit=200');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.limit).toBe(100);
    });
  });

  describe('sorting', () => {
    it('should support sortBy=date (default)', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortBy=date');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortBy).toBe('date');
    });

    it('should support sortBy=seeders', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortBy=seeders');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortBy).toBe('seeders');
    });

    it('should support sortBy=name', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortBy=name');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortBy).toBe('name');
    });

    it('should support sortBy=size', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortBy=size');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortBy).toBe('size');
    });

    it('should support sortOrder=asc', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortOrder=asc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortOrder).toBe('asc');
    });

    it('should support sortOrder=desc (default)', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortOrder=desc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sortOrder).toBe('desc');
    });

    it('should return 400 for invalid sortBy', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortBy=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid sortBy');
    });

    it('should return 400 for invalid sortOrder', async () => {
      const request = createRequest('/api/browse?contentType=movie&sortOrder=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid sortOrder');
    });
  });

  describe('filtering', () => {
    it('should support search query parameter', async () => {
      const request = createRequest('/api/browse?contentType=movie&q=test');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should support year filter', async () => {
      const request = createRequest('/api/browse?contentType=movie&year=2024');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });
});
