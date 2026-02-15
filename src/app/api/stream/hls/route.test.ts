import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock subscription guard
const mockRequireActiveSubscription = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: (...args: unknown[]) => mockRequireActiveSubscription(...args),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  generateRequestId: vi.fn(() => 'req-test-123'),
}));

// Mock streaming service
const mockGetStreamInfo = vi.fn();
const mockCreateStream = vi.fn();
vi.mock('@/lib/streaming', () => ({
  getStreamingService: vi.fn(() => ({
    getStreamInfo: mockGetStreamInfo,
    createStream: mockCreateStream,
  })),
}));

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getTorrentByInfohash: vi.fn().mockResolvedValue({
    magnet_uri: 'magnet:?xt=urn:btih:aabbccdd',
  }),
}));

// Mock codec detection
vi.mock('@/lib/codec-detection', () => ({
  getFFmpegDemuxerForExtension: vi.fn(() => null),
}));

// Mock ffmpeg manager
vi.mock('@/lib/ffmpeg-manager', () => ({
  getFFmpegManager: vi.fn(() => ({
    register: vi.fn(),
  })),
}));

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdin: { on: vi.fn(), pipe: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 1234,
  })),
}));

// Mock fs - no active session, no existing playlist
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}));

import { GET } from './route';
import { NextResponse } from 'next/server';

describe('HLS Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireActiveSubscription.mockResolvedValue(null);
  });

  it('returns subscription error when not subscribed', async () => {
    const errorResponse = NextResponse.json({ error: 'Subscription required' }, { status: 403 });
    mockRequireActiveSubscription.mockResolvedValue(errorResponse);

    const req = new NextRequest('http://localhost/api/stream/hls?infohash=abc&fileIndex=0');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 when infohash missing', async () => {
    const req = new NextRequest('http://localhost/api/stream/hls?fileIndex=0');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing');
  });

  it('returns 400 when fileIndex missing', async () => {
    const req = new NextRequest('http://localhost/api/stream/hls?infohash=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing');
  });

  it('returns 400 for negative fileIndex', async () => {
    const req = new NextRequest('http://localhost/api/stream/hls?infohash=abc&fileIndex=-1');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid fileIndex');
  });

  it('returns 400 for non-numeric fileIndex', async () => {
    const req = new NextRequest('http://localhost/api/stream/hls?infohash=abc&fileIndex=xyz');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid fileIndex');
  });

  it('returns 500 when streaming service throws', async () => {
    mockGetStreamInfo.mockRejectedValue(new Error('torrent not found'));

    const req = new NextRequest('http://localhost/api/stream/hls?infohash=abc&fileIndex=0');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('Failed');
  });
});
