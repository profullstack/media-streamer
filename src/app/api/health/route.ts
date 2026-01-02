/**
 * Health Check API Route
 *
 * Used for health checks and monitoring
 */

import { NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: 'connected' | 'disconnected' | 'unknown';
    cache: 'connected' | 'disconnected' | 'unknown';
  };
  dht?: {
    ready: boolean;
    nodeCount: number;
  };
  torrents?: {
    activeCount: number;
    activeStreams: number;
  };
  memory?: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // Get streaming service status
  const service = getStreamingService();
  const dhtStatus = service.getDhtStatus();
  const torrentStats = service.getAllTorrentStats();
  
  // Get memory usage for monitoring
  const memoryUsage = process.memoryUsage();
  
  const response: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    uptime,
    environment: process.env.NODE_ENV ?? 'development',
    services: {
      database: process.env.SUPABASE_URL ? 'connected' : 'unknown',
      cache: 'unknown',
    },
    dht: dhtStatus,
    torrents: {
      activeCount: torrentStats.length,
      activeStreams: service.getActiveStreamCount(),
    },
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
    },
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
