/**
 * Health Check API Route
 *
 * Used for health checks and monitoring
 */

import { NextResponse } from 'next/server';
import { StreamingService } from '@/lib/streaming';

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
}

const startTime = Date.now();

// Singleton streaming service instance (shared with stream route)
let streamingService: StreamingService | null = null;

function getStreamingService(): StreamingService {
  if (!streamingService) {
    streamingService = new StreamingService({
      maxConcurrentStreams: 10,
      streamTimeout: 90000,
    });
  }
  return streamingService;
}

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // Get streaming service status
  const service = getStreamingService();
  const dhtStatus = service.getDhtStatus();
  const torrentStats = service.getAllTorrentStats();
  
  const response: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    uptime,
    environment: process.env.NODE_ENV ?? 'development',
    services: {
      database: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'connected' : 'unknown',
      cache: 'unknown',
    },
    dht: dhtStatus,
    torrents: {
      activeCount: torrentStats.length,
      activeStreams: service.getActiveStreamCount(),
    },
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
