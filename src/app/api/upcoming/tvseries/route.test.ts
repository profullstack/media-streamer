/**
 * Upcoming TV Series API Route Tests
 *
 * Tests for GET /api/upcoming/tvseries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock TMDB service
const mockGetUpcomingTVSeries = vi.fn();

vi.mock('@/lib/tmdb', () => ({
  getTMDBService: vi.fn(() => ({
    getUpcomingTVSeries: mockGetUpcomingTVSeries,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

describe('Upcoming TV Series API - GET /api/upcoming/tvseries', () => {
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

    const request = new NextRequest('http://localhost/api/upcoming/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 500 when TMDB_API_KEY is not set', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    delete process.env.TMDB_API_KEY;

    const request = new NextRequest('http://localhost/api/upcoming/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('TMDB');
  });

  it('should return upcoming TV series with default page 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const mockResult = {
      items: [
        { id: 10, title: 'Show A', mediaType: 'tv', releaseDate: '2026-03-01' },
        { id: 20, title: 'Show B', mediaType: 'tv', releaseDate: '2026-04-01' },
      ],
      page: 1,
      totalPages: 3,
      totalResults: 60,
    };
    mockGetUpcomingTVSeries.mockResolvedValueOnce(mockResult);

    const request = new NextRequest('http://localhost/api/upcoming/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(3);
    expect(mockGetUpcomingTVSeries).toHaveBeenCalledWith(1);
  });

  it('should pass page parameter to service', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingTVSeries.mockResolvedValueOnce({
      items: [],
      page: 2,
      totalPages: 3,
      totalResults: 60,
    });

    const request = new NextRequest('http://localhost/api/upcoming/tvseries?page=2');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetUpcomingTVSeries).toHaveBeenCalledWith(2);
  });

  it('should clamp negative page numbers to 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingTVSeries.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/upcoming/tvseries?page=-1');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetUpcomingTVSeries).toHaveBeenCalledWith(1);
  });

  it('should set Cache-Control header', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingTVSeries.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/upcoming/tvseries');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=1800');
  });

  it('should return 500 on service error', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    mockGetUpcomingTVSeries.mockRejectedValueOnce(new Error('TMDB API down'));

    const request = new NextRequest('http://localhost/api/upcoming/tvseries');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Failed');
  });
});
