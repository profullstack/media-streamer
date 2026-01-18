/**
 * Health Check API Tests
 *
 * Tests for the health check endpoint that provides system status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Create mock streaming service
const mockStreamingService = {
  getDhtStatus: vi.fn().mockReturnValue({ ready: true, nodeCount: 10 }),
  getAllTorrentStats: vi.fn().mockReturnValue([]),
  getActiveStreamCount: vi.fn().mockReturnValue(0),
  getDebugInfo: vi.fn().mockReturnValue({
    activeStreams: 0,
    activeTorrents: 0,
    totalWatchers: 0,
    watchersPerTorrent: [],
    dht: { ready: true, nodeCount: 10 },
    torrents: [],
  }),
};

// Create mock file transcoding service
const mockFileTranscodingService = {
  getActiveDownloadCount: vi.fn().mockReturnValue(0),
  getActiveTranscodeCount: vi.fn().mockReturnValue(0),
};

// Mock the streaming service module
vi.mock('@/lib/streaming', () => ({
  getStreamingService: vi.fn(() => mockStreamingService),
}));

// Mock the file transcoding service module
vi.mock('@/lib/file-transcoding', () => ({
  getFileTranscodingService: vi.fn(() => mockFileTranscodingService),
}));

// Import after mocks
import { GET, type HealthCheckResponse } from './route';

// Helper to create a mock NextRequest
function createMockRequest(url: string = 'http://localhost/api/health'): NextRequest {
  return new NextRequest(url);
}

describe('Health Check API - GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockStreamingService.getDhtStatus.mockReturnValue({ ready: true, nodeCount: 10 });
    mockStreamingService.getAllTorrentStats.mockReturnValue([]);
    mockStreamingService.getActiveStreamCount.mockReturnValue(0);
    mockStreamingService.getDebugInfo.mockReturnValue({
      activeStreams: 0,
      activeTorrents: 0,
      totalWatchers: 0,
      watchersPerTorrent: [],
      dht: { ready: true, nodeCount: 10 },
      torrents: [],
    });
    mockFileTranscodingService.getActiveDownloadCount.mockReturnValue(0);
    mockFileTranscodingService.getActiveTranscodeCount.mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 200 with healthy status', async () => {
    const response = await GET(createMockRequest());

    expect(response.status).toBe(200);
    const data: HealthCheckResponse = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should include timestamp in ISO format', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.timestamp).toBeDefined();
    // Verify it's a valid ISO date string
    const date = new Date(data.timestamp);
    expect(date.toISOString()).toBe(data.timestamp);
  });

  it('should include uptime in seconds', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include environment information', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.environment).toBeDefined();
    expect(typeof data.environment).toBe('string');
  });

  it('should include DHT status from streaming service', async () => {
    mockStreamingService.getDebugInfo.mockReturnValue({
      activeStreams: 0,
      activeTorrents: 0,
      totalWatchers: 0,
      watchersPerTorrent: [],
      dht: { ready: true, nodeCount: 25 },
      torrents: [],
    });

    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.dht).toBeDefined();
    expect(data.dht?.ready).toBe(true);
    expect(data.dht?.nodeCount).toBe(25);
  });

  it('should include torrent statistics', async () => {
    mockStreamingService.getDebugInfo.mockReturnValue({
      activeStreams: 2,
      activeTorrents: 2,
      totalWatchers: 3,
      watchersPerTorrent: [],
      dht: { ready: true, nodeCount: 10 },
      torrents: [
        { infohash: 'abc123', name: 'Test', numPeers: 5, progress: 0.5, downloadSpeed: 1000 },
        { infohash: 'def456', name: 'Test2', numPeers: 3, progress: 0.8, downloadSpeed: 500 },
      ],
    });

    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.torrents).toBeDefined();
    expect(data.torrents?.activeCount).toBe(2);
    expect(data.torrents?.activeStreams).toBe(2);
    expect(data.torrents?.totalWatchers).toBe(3);
  });

  it('should include memory usage statistics', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.memory).toBeDefined();
    expect(typeof data.memory?.heapUsedMB).toBe('number');
    expect(typeof data.memory?.heapTotalMB).toBe('number');
    expect(typeof data.memory?.rssMB).toBe('number');
    expect(typeof data.memory?.externalMB).toBe('number');

    // Memory values should be positive
    expect(data.memory?.heapUsedMB).toBeGreaterThan(0);
    expect(data.memory?.heapTotalMB).toBeGreaterThan(0);
    expect(data.memory?.rssMB).toBeGreaterThan(0);
  });

  it('should include no-cache headers', async () => {
    const response = await GET(createMockRequest());

    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
  });

  it('should include services status', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.services).toBeDefined();
    expect(data.services.database).toBeDefined();
    expect(data.services.cache).toBeDefined();
  });

  it('should use the shared streaming service singleton', async () => {
    const { getStreamingService } = await import('@/lib/streaming');

    await GET(createMockRequest());

    expect(getStreamingService).toHaveBeenCalled();
  });

  it('should include debug info when debug=true', async () => {
    mockStreamingService.getDebugInfo.mockReturnValue({
      activeStreams: 1,
      activeTorrents: 1,
      totalWatchers: 2,
      watchersPerTorrent: [{ infohash: 'abc123', watchers: 2, hasCleanupTimer: false }],
      dht: { ready: true, nodeCount: 10 },
      torrents: [{ infohash: 'abc123', name: 'Test', numPeers: 5, progress: 0.5, downloadSpeed: 1000 }],
    });

    const response = await GET(createMockRequest('http://localhost/api/health?debug=true'));
    const data: HealthCheckResponse = await response.json();

    expect(data.debug).toBeDefined();
    expect(data.debug?.watchersPerTorrent).toHaveLength(1);
    expect(data.debug?.torrents).toHaveLength(1);
  });

  it('should not include debug info without debug=true', async () => {
    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.debug).toBeUndefined();
  });

  it('should include transcoding status', async () => {
    mockFileTranscodingService.getActiveDownloadCount.mockReturnValue(2);
    mockFileTranscodingService.getActiveTranscodeCount.mockReturnValue(1);

    const response = await GET(createMockRequest());
    const data: HealthCheckResponse = await response.json();

    expect(data.transcoding).toBeDefined();
    expect(data.transcoding?.activeDownloads).toBe(2);
    expect(data.transcoding?.activeTranscodes).toBe(1);
  });
});
