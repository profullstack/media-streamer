import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mocks, logger } = vi.hoisted(() => {
  const testLogger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  testLogger.child.mockReturnValue(testLogger);

  return {
    logger: testLogger,
    mocks: {
      rangeEq: vi.fn(),
      range: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
      from: vi.fn(),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => logger),
  generateRequestId: vi.fn(() => 'request-1'),
}));

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(() => ({
    from: mocks.from,
  })),
  resetServerClient: vi.fn(),
}));

vi.mock('@/lib/transforms', () => ({
  transformTorrents: vi.fn((rows: unknown[]) => rows),
}));

vi.mock('@/lib/indexer', () => ({
  IndexerService: vi.fn(),
  IndexerError: class IndexerError extends Error {},
}));

vi.mock('@/lib/metadata-enrichment', () => ({
  cleanTorrentNameForDisplay: vi.fn((name: string) => name),
  enrichTorrentMetadata: vi.fn(),
}));

vi.mock('@/lib/codec-detection', () => ({
  detectCodecFromUrl: vi.fn(),
  formatCodecInfoForDb: vi.fn(),
}));

import { GET } from './route';

function setupTorrentsQuery(): void {
  mocks.rangeEq.mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.range.mockReturnValue({
    data: [],
    error: null,
    count: 0,
    eq: mocks.rangeEq,
  });
  mocks.order.mockReturnValue({ range: mocks.range });
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.from.mockReturnValue({ select: mocks.select });
}

describe('GET /api/torrents pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTorrentsQuery();
  });

  it('falls back to default pagination when params are malformed', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/torrents?limit=bad&offset=wat&page=nope'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(0, 49);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
    expect(data.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: 0,
      hasMore: false,
    });
  });

  it('rejects negative and fractional pagination params', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/torrents?limit=1.5&page=-2'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(0, 49);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
  });

  it('caps valid limits and computes page offsets safely', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/torrents?limit=500&page=3'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(200, 299);
    expect(data.limit).toBe(100);
    expect(data.offset).toBe(200);
    expect(data.pagination.page).toBe(3);
  });
});
