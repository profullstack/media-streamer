/**
 * Upcoming Movies API Route Tests
 *
 * Tests for GET /api/upcoming/movies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock TMDB service
const mockGetUpcomingMovies = vi.fn();

vi.mock('@/lib/tmdb', () => ({
  getTMDBService: vi.fn(() => ({
    getUpcomingMovies: mockGetUpcomingMovies,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

describe('Upcoming Movies API - GET /api/upcoming/movies', () => {
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

    const request = new NextRequest('http://localhost/api/upcoming/movies');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 500 when TMDB_API_KEY is not set', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    delete process.env.TMDB_API_KEY;

    const request = new NextRequest('http://localhost/api/upcoming/movies');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('TMDB');
  });

  it('should return upcoming movies with default page 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const mockResult = {
      items: [
        { id: 1, title: 'Movie A', mediaType: 'movie', releaseDate: '2026-03-01' },
        { id: 2, title: 'Movie B', mediaType: 'movie', releaseDate: '2026-04-01' },
      ],
      page: 1,
      totalPages: 5,
      totalResults: 100,
    };
    mockGetUpcomingMovies.mockResolvedValueOnce(mockResult);

    const request = new NextRequest('http://localhost/api/upcoming/movies');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(5);
    expect(mockGetUpcomingMovies).toHaveBeenCalledWith(1);
  });

  it('should pass page parameter to service', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingMovies.mockResolvedValueOnce({
      items: [],
      page: 3,
      totalPages: 5,
      totalResults: 100,
    });

    const request = new NextRequest('http://localhost/api/upcoming/movies?page=3');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetUpcomingMovies).toHaveBeenCalledWith(3);
  });

  it('should clamp negative page numbers to 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingMovies.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/upcoming/movies?page=-5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetUpcomingMovies).toHaveBeenCalledWith(1);
  });

  it('should set Cache-Control header', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockGetUpcomingMovies.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/upcoming/movies');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=1800');
  });

  it('should return 500 on service error', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    mockGetUpcomingMovies.mockRejectedValueOnce(new Error('TMDB API down'));

    const request = new NextRequest('http://localhost/api/upcoming/movies');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Failed');
  });
});
