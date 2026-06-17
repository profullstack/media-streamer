import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    range: vi.fn(),
    order: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => {
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  return {
    createLogger: vi.fn(() => logger),
    generateRequestId: vi.fn(() => 'request-1'),
  };
});

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(() => ({
    from: mocks.from,
  })),
  resetServerClient: vi.fn(),
}));

vi.mock('@/lib/transforms', () => ({
  transformTorrents: vi.fn((rows: unknown[]) => rows),
}));

vi.mock('@/lib/imdb/enrich', () => ({
  batchEnrichWithImdb: vi.fn(async (rows: unknown[]) => rows),
}));

import { GET } from './route';

function setupBrowseQuery(): void {
  mocks.range.mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.order.mockReturnValue({ range: mocks.range });
  mocks.eq.mockReturnValue({
    ilike: vi.fn().mockReturnThis(),
    eq: mocks.eq,
    order: mocks.order,
  });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({ select: mocks.select });
}

function createRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

describe('GET /api/browse pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBrowseQuery();
  });

  it('falls back to default pagination when params are malformed', async () => {
    const response = await GET(
      createRequest('/api/browse?contentType=movie&limit=bad&offset=wat')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(0, 49);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
  });

  it('rejects negative and fractional pagination params', async () => {
    const response = await GET(
      createRequest('/api/browse?contentType=movie&limit=1.5&offset=-10')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(0, 49);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
  });

  it('caps valid limits while preserving valid offsets', async () => {
    const response = await GET(
      createRequest('/api/browse?contentType=movie&limit=500&offset=25')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.range).toHaveBeenCalledWith(25, 124);
    expect(data.limit).toBe(100);
    expect(data.offset).toBe(25);
  });
});
