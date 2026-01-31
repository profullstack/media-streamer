/**
 * Recent TV Series API Route Tests
 *
 * Tests for GET /api/recent/tvseries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock TMDB service
const mockGetRecentTVSeries = vi.fn();

vi.mock('@/lib/tmdb', () => ({
  getTMDBService: vi.fn(() => ({
    getRecentTVSeries: mockGetRecentTVSeries,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

describe('Recent TV Series API - GET /api/recent/tvseries', () => {
  const originalEnv = process.env.TMDB_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMDB_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TMDB_API_KEY = originalEnv;
    } else {
      delete process.env.TMDB_API_KEY;
    }
  });

  it('should return 401 when not authenticated', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost/api/recent/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 500 when TMDB_API_KEY is not set', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    delete process.env.TMDB_API_KEY;

    const request = new NextRequest('http://localhost/api/recent/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('TMDB');
  });

  it('should return recent TV series with default page 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const mockResult = {
      items: [
        { id: 10, title: 'Recent Show A', mediaType: 'tv', releaseDate: '2026-01-25' },
        { id: 20, title: 'Recent Show B', mediaType: 'tv', releaseDate: '2026-01-20' },
      ],
      page: 1,
      totalPages: 3,
      totalResults: 60,
    };
    mockGetRecentTVSeries.mockResolvedValueOnce(mockResult);

    const request = new NextRequest('http://localhost/api/recent/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.page).toBe(1);
    expect(mockGetRecentTVSeries).toHaveBeenCalledWith(1);
  });

  it('should pass page parameter to service', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetRecentTVSeries.mockResolvedValueOnce({
      items: [],
      page: 2,
      totalPages: 3,
      totalResults: 60,
    });

    const request = new NextRequest('http://localhost/api/recent/tvseries?page=2');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetRecentTVSeries).toHaveBeenCalledWith(2);
  });

  it('should clamp negative page numbers to 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetRecentTVSeries.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/recent/tvseries?page=-3');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetRecentTVSeries).toHaveBeenCalledWith(1);
  });

  it('should set Cache-Control header', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetRecentTVSeries.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/recent/tvseries');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=1800');
  });

  it('should return 500 on service error', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    mockGetRecentTVSeries.mockRejectedValueOnce(new Error('TMDB API down'));

    const request = new NextRequest('http://localhost/api/recent/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Failed');
  });
});
