/**
 * Radio Search API Route Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the radio service
const mockSearchStations = vi.fn();
vi.mock('@/lib/radio', () => ({
  getRadioService: () => ({
    searchStations: mockSearchStations,
  }),
}));

describe('GET /api/radio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when search query is missing', async () => {
    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Search query is required');
  });

  it('returns 400 when search query is empty', async () => {
    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio?q=');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Search query is required');
  });

  it('searches for radio stations', async () => {
    mockSearchStations.mockResolvedValue([
      { id: 's123', name: 'NPR News', genre: 'News' },
      { id: 's456', name: 'ESPN Radio', genre: 'Sports' },
    ]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio?q=news');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stations).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(mockSearchStations).toHaveBeenCalledWith({
      query: 'news',
      filter: undefined,
      limit: 50,
    });
  });

  it('applies filter parameter', async () => {
    mockSearchStations.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio?q=test&filter=s');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(mockSearchStations).toHaveBeenCalledWith({
      query: 'test',
      filter: 's',
      limit: 50,
    });
  });

  it('applies limit parameter with max of 100', async () => {
    mockSearchStations.mockResolvedValue([]);

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio?q=test&limit=200');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(mockSearchStations).toHaveBeenCalledWith({
      query: 'test',
      filter: undefined,
      limit: 100, // Capped at 100
    });
  });

  it('returns 500 on service error', async () => {
    mockSearchStations.mockRejectedValue(new Error('Service error'));

    const { GET } = await import('./route');
    const request = new Request('http://localhost/api/radio?q=test');
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to search radio stations');
  });
});
