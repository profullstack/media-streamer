/**
 * Health Check API Tests
 *
 * Tests for the health check endpoint that provides system status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

// Create mock streaming service
const mockStreamingService = {
  getDhtStatus: vi.fn().mockReturnValue({ ready: true, nodeCount: 10 }),
  getAllTorrentStats: vi.fn().mockReturnValue([]),
  getActiveStreamCount: vi.fn().mockReturnValue(0),
};

// Mock the streaming service module
vi.mock('@/lib/streaming', () => ({
  getStreamingService: vi.fn(() => mockStreamingService),
}));

// Import after mocks
import { GET, type HealthCheckResponse } from './route';

describe('Health Check API - GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockStreamingService.getDhtStatus.mockReturnValue({ ready: true, nodeCount: 10 });
    mockStreamingService.getAllTorrentStats.mockReturnValue([]);
    mockStreamingService.getActiveStreamCount.mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 200 with healthy status', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const data: HealthCheckResponse = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should include timestamp in ISO format', async () => {
    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(data.timestamp).toBeDefined();
    // Verify it's a valid ISO date string
    const date = new Date(data.timestamp);
    expect(date.toISOString()).toBe(data.timestamp);
  });

  it('should include uptime in seconds', async () => {
    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include environment information', async () => {
    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(data.environment).toBeDefined();
    expect(typeof data.environment).toBe('string');
  });

  it('should include DHT status from streaming service', async () => {
    mockStreamingService.getDhtStatus.mockReturnValue({ ready: true, nodeCount: 25 });

    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(data.dht).toBeDefined();
    expect(data.dht?.ready).toBe(true);
    expect(data.dht?.nodeCount).toBe(25);
  });

  it('should include torrent statistics', async () => {
    mockStreamingService.getAllTorrentStats.mockReturnValue([
      { infohash: 'abc123', numPeers: 5 },
      { infohash: 'def456', numPeers: 3 },
    ]);
    mockStreamingService.getActiveStreamCount.mockReturnValue(2);

    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(data.torrents).toBeDefined();
    expect(data.torrents?.activeCount).toBe(2);
    expect(data.torrents?.activeStreams).toBe(2);
  });

  it('should include memory usage statistics', async () => {
    const response = await GET();
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
    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
  });

  it('should include services status', async () => {
    const response = await GET();
    const data: HealthCheckResponse = await response.json();

    expect(data.services).toBeDefined();
    expect(data.services.database).toBeDefined();
    expect(data.services.cache).toBeDefined();
  });

  it('should use the shared streaming service singleton', async () => {
    const { getStreamingService } = await import('@/lib/streaming');
    
    await GET();

    expect(getStreamingService).toHaveBeenCalled();
  });
});
