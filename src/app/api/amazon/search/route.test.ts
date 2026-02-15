import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import { GET } from './route';

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/amazon/search');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as any;
}

describe('Amazon Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when title is missing', async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('title is required');
  });

  it('returns 400 when title is empty', async () => {
    const res = await GET(makeRequest({ title: '  ' }));
    expect(res.status).toBe(400);
  });

  it('returns first result on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        search_results: [
          {
            title: 'Goodfellas [Blu-ray]',
            link: 'https://amazon.com/dp/B001234?tag=media-streamer-20',
            image: 'https://images.amazon.com/goodfellas.jpg',
            price: { raw: '$14.99' },
            rating: 4.8,
            asin: 'B001234',
          },
        ],
      }),
    });

    const res = await GET(makeRequest({ title: 'Goodfellas', contentType: 'movie' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeTruthy();
    expect(body.result.title).toBe('Goodfellas [Blu-ray]');
    expect(body.result.url).toContain('amazon.com');
    expect(body.result.price).toBe('$14.99');

    // Verify category_id was sent for movie
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('category_id=2625373011');
    expect(fetchUrl).toContain('associate_id=media-streamer-20');
  });

  it('returns null result when no search results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_results: [] }),
    });

    const res = await GET(makeRequest({ title: 'xyznonexistent123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeNull();
  });

  it('returns 502 on Rainforest API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET(makeRequest({ title: 'Goodfellas' }));
    expect(res.status).toBe(502);
  });

  it('uses music category for music content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_results: [] }),
    });

    await GET(makeRequest({ title: 'Bad Religion', contentType: 'music' }));
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('category_id=5174');
  });

  it('uses books category for book content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_results: [] }),
    });

    await GET(makeRequest({ title: 'Dune', contentType: 'book' }));
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('category_id=283155');
  });

  it('omits category_id for unknown content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_results: [] }),
    });

    await GET(makeRequest({ title: 'Something', contentType: 'other' }));
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).not.toContain('category_id');
  });

  it('handles fetch exceptions gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const res = await GET(makeRequest({ title: 'Goodfellas' }));
    expect(res.status).toBe(500);
  });
});
