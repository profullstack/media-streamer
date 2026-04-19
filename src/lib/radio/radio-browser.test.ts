import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioBrowserService } from './radio-browser';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Radio Browser service', () => {
  const service = createRadioBrowserService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps search results into radio stations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        {
          stationuuid: 'uuid-1',
          name: 'KNBR 680',
          favicon: 'https://example.com/logo.png',
          tags: 'sports,talk,baseball',
          country: 'United States',
          state: 'California',
          clickcount: 42,
        },
      ]),
    });

    const results = await service.search({ query: 'knbr', limit: 10 });

    expect(results).toEqual([
      {
        id: 'rb:uuid-1',
        name: 'KNBR 680',
        description: 'California, United States',
        imageUrl: 'https://example.com/logo.png',
        genre: 'sports, talk',
        reliability: 42,
      },
    ]);
  });

  it('returns stream data from click and station lookups', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://stream.example.com/radio.m3u8',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            stationuuid: 'uuid-1',
            bitrate: 128,
            hls: 1,
          },
        ]),
      });

    const { streams, preferred } = await service.getStream('rb:uuid-1');

    expect(streams).toHaveLength(1);
    expect(preferred).toEqual({
      url: 'https://stream.example.com/radio.m3u8',
      mediaType: 'hls',
      bitrate: 128,
      isDirect: true,
    });
  });
});
