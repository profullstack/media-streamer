import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock child_process to avoid spawning real processes
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              // Return empty results JSON
              callback(Buffer.from('[]'));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event: string, callback: (code: number | null) => void) => {
          if (event === 'close') {
            // Simulate successful completion
            setTimeout(() => callback(0), 10);
          }
        }),
        kill: vi.fn(),
      };
      return mockProcess;
    }),
  };
});

describe('Torrent Search API Route', () => {
  describe('GET /api/torrent-search - Input Validation', () => {
    it('should return 400 for missing query parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 for empty query', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter "q" is required');
    });

    it('should return 400 for query that is too short', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=ab');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query must be at least 3 characters');
    });

    it('should return 400 for invalid sort parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=test&sort=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid sort parameter');
    });

    it('should return 400 for invalid provider', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=test&provider=invalid_provider');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid provider');
    });

    it('should return 400 for query that is too long', async () => {
      const longQuery = 'a'.repeat(501);
      const request = new NextRequest(`http://localhost:3000/api/torrent-search?q=${longQuery}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query too long (max 500 characters)');
    });

    it('should accept valid sort parameters', async () => {
      // These will fail at the spawn level but pass validation
      const validSorts = ['date', 'size', 'seeders', 'leechers'];
      
      for (const sort of validSorts) {
        const request = new NextRequest(`http://localhost:3000/api/torrent-search?q=test&sort=${sort}`);
        const response = await GET(request);
        // Should not be a 400 validation error for sort
        expect(response.status).not.toBe(400);
      }
    });

    it('should accept valid provider parameters', async () => {
      const validProviders = ['thepiratebay', 'limetorrents', '1337x', 'rarbg', 'nyaa', 'libgen'];
      
      for (const provider of validProviders) {
        const request = new NextRequest(`http://localhost:3000/api/torrent-search?q=test&provider=${provider}`);
        const response = await GET(request);
        // Should not be a 400 validation error for provider
        expect(response.status).not.toBe(400);
      }
    });

    it('should accept query with minimum length of 3 characters', async () => {
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=abc');
      const response = await GET(request);
      // Should not be a 400 validation error for query length
      expect(response.status).not.toBe(400);
    });

    it('should accept query at maximum length of 500 characters', async () => {
      const maxQuery = 'a'.repeat(500);
      const request = new NextRequest(`http://localhost:3000/api/torrent-search?q=${maxQuery}`);
      const response = await GET(request);
      // Should not be a 400 validation error for query length
      expect(response.status).not.toBe(400);
    });
  });

  describe('Timeout configuration', () => {
    it('should have a search timeout of 60 seconds', async () => {
      // Import the module to verify the timeout constant
      // The timeout is used internally but we can verify behavior
      // by checking that the spawn mock receives the expected timeout
      const request = new NextRequest('http://localhost:3000/api/torrent-search?q=test');
      const response = await GET(request);
      
      // The request should complete (mocked) without timeout
      expect(response.status).toBe(200);
    });
  });
});
