/**
 * TMDB Search API Route Tests
 *
 * Tests for GET /api/tmdb/search
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock TMDB service
const mockSearchMulti = vi.fn();

vi.mock('@/lib/tmdb', () => ({
  getTMDBService: vi.fn(() => ({
    searchMulti: mockSearchMulti,
  })),
}));

import { getAuthenticatedUser } from '@/lib/auth';

describe('TMDB Search API - GET /api/tmdb/search', () => {
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

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 500 when TMDB_API_KEY is not set', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    delete process.env.TMDB_API_KEY;

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('TMDB');
  });

  it('should return 400 when query is missing', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const request = new NextRequest('http://localhost/api/tmdb/search');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('2 characters');
  });

  it('should return 400 when query is too short', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=a');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('2 characters');
  });

  it('should return 400 when query is only whitespace', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=%20%20');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('should search and return results with default page 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    const mockResult = {
      items: [
        { id: 1, title: 'Batman Begins', mediaType: 'movie', releaseDate: '2005-06-15' },
        { id: 10, title: 'Batman: TAS', mediaType: 'tv', releaseDate: '1992-09-05' },
      ],
      page: 1,
      totalPages: 3,
      totalResults: 50,
    };
    mockSearchMulti.mockResolvedValueOnce(mockResult);

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(2);
    expect(data.totalResults).toBe(50);
    expect(mockSearchMulti).toHaveBeenCalledWith('batman', 1);
  });

  it('should pass page parameter to service', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockSearchMulti.mockResolvedValueOnce({
      items: [],
      page: 2,
      totalPages: 3,
      totalResults: 50,
    });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman&page=2');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockSearchMulti).toHaveBeenCalledWith('batman', 2);
  });

  it('should clamp negative page numbers to 1', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockSearchMulti.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman&page=-5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockSearchMulti).toHaveBeenCalledWith('batman', 1);
  });

  it('should trim query whitespace', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockSearchMulti.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=%20batman%20');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockSearchMulti).toHaveBeenCalledWith('batman', 1);
  });

  it('should set Cache-Control header with 15 min max-age', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });

    mockSearchMulti.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
      totalResults: 0,
    });

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman');
    const response = await GET(request);

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=900');
  });

  it('should return 500 on service error', async () => {
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user-123' });
    mockSearchMulti.mockRejectedValueOnce(new Error('TMDB API down'));

    const request = new NextRequest('http://localhost/api/tmdb/search?q=batman');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('Failed');
  });
});
