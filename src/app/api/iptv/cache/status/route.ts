/**
 * IPTV Cache Status API Route
 *
 * GET /api/iptv/cache/status
 *
 * Returns the current status of the IPTV cache worker,
 * including last run time, cache statistics, and health.
 */

import { NextResponse } from 'next/server';
import { getIptvCacheReader } from '@/lib/iptv/cache-reader';

/**
 * GET /api/iptv/cache/status
 *
 * Returns cache worker status and statistics.
 */
export async function GET(): Promise<Response> {
  const cacheReader = getIptvCacheReader();

  // Check if cache is available
  const isAvailable = await cacheReader.isAvailable();

  if (!isAvailable) {
    return NextResponse.json({
      status: 'unavailable',
      message: 'Redis cache not available',
      redis: false,
    });
  }

  // Get worker status
  const statusResult = await cacheReader.getWorkerStatus();
  const lastRun = await cacheReader.getLastRun();

  if (!statusResult.success || !statusResult.data) {
    return NextResponse.json({
      status: 'unknown',
      message: 'Worker has not run yet or status not available',
      redis: true,
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    });
  }

  const workerStatus = statusResult.data;

  // Calculate health status
  let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const now = Date.now();

  // Check if last successful run was more than 30 minutes ago
  if (workerStatus.lastSuccessfulRun) {
    const timeSinceLastRun = now - workerStatus.lastSuccessfulRun;
    if (timeSinceLastRun > 30 * 60 * 1000) {
      health = 'degraded';
    }
    if (timeSinceLastRun > 60 * 60 * 1000) {
      health = 'unhealthy';
    }
  } else {
    health = 'degraded';
  }

  // Check for errors
  if (workerStatus.state === 'error' || workerStatus.currentError) {
    health = 'unhealthy';
  }

  return NextResponse.json({
    status: health,
    redis: true,
    worker: {
      state: workerStatus.state,
      startedAt: workerStatus.startedAt
        ? new Date(workerStatus.startedAt).toISOString()
        : null,
      lastSuccessfulRun: workerStatus.lastSuccessfulRun
        ? new Date(workerStatus.lastSuccessfulRun).toISOString()
        : null,
      nextRun: workerStatus.nextRun
        ? new Date(workerStatus.nextRun).toISOString()
        : null,
      error: workerStatus.currentError,
    },
    stats: {
      playlistsProcessed: workerStatus.playlistsProcessed,
      playlistsFailed: workerStatus.playlistsFailed,
      totalChannels: workerStatus.totalChannels,
      totalPrograms: workerStatus.totalPrograms,
    },
    timestamps: {
      now: new Date(now).toISOString(),
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    },
  });
}
