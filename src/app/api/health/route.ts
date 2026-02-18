/**
 * Health Check API Route
 *
 * Used for health checks and monitoring
 * Add ?debug=true for detailed debugging information
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStreamingService } from '@/lib/streaming';
import { getFileTranscodingService } from '@/lib/file-transcoding';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  uptimeFormatted: string;
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
    totalWatchers?: number;
    clientActive?: boolean;
    streaming?: { name: string; infohash: string; numPeers: number; progress: number; downloadSpeed: number; downloadedMB: number; sizeMB: number }[];
  };
  transcoding?: {
    activeDownloads: number;
    activeTranscodes: number;
  };
  memory?: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  debug?: {
    watchersPerTorrent: { infohash: string; watchers: number; hasCleanupTimer: boolean }[];
    torrents: { infohash: string; name: string; numPeers: number; progress: number; downloadSpeed: number; downloaded: number; length: number }[];
  };
}

const startTime = Date.now();

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export async function GET(request: NextRequest): Promise<NextResponse<HealthCheckResponse>> {
  const { searchParams } = new URL(request.url);
  const showDebug = searchParams.get('debug') === 'true';

  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Get streaming service status
  const service = getStreamingService();
  const debugInfo = service.getDebugInfo();

  // Get file transcoding service status
  const fileTranscodingService = getFileTranscodingService();

  // Get memory usage for monitoring
  const memoryUsage = process.memoryUsage();

  const response: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    uptime,
    uptimeFormatted: formatUptime(uptime),
    environment: process.env.NODE_ENV ?? 'development',
    services: {
      database: process.env.SUPABASE_URL ? 'connected' : 'unknown',
      cache: 'unknown',
    },
    dht: debugInfo.dht,
    torrents: {
      activeCount: debugInfo.activeTorrents,
      activeStreams: debugInfo.activeStreams,
      totalWatchers: debugInfo.totalWatchers,
      clientActive: service.isClientActive,
      streaming: debugInfo.torrents.map(t => ({
        name: t.name,
        infohash: t.infohash,
        numPeers: t.numPeers,
        progress: Math.round(t.progress * 100 * 100) / 100,
        downloadSpeed: t.downloadSpeed,
        downloadedMB: Math.round(t.downloaded / 1024 / 1024 * 100) / 100,
        sizeMB: Math.round(t.length / 1024 / 1024 * 100) / 100,
      })),
    },
    transcoding: {
      activeDownloads: fileTranscodingService.getActiveDownloadCount(),
      activeTranscodes: fileTranscodingService.getActiveTranscodeCount(),
    },
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
    },
  };

  // Add detailed debug info if requested
  if (showDebug) {
    response.debug = {
      watchersPerTorrent: debugInfo.watchersPerTorrent,
      torrents: debugInfo.torrents,
    };
  }

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
