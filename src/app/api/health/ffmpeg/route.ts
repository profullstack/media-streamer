/**
 * FFmpeg Health Check Endpoint
 * 
 * GET /api/health/ffmpeg
 * Returns stats about active FFmpeg processes
 */

import { NextResponse } from 'next/server';
import { getFFmpegManager } from '@/lib/ffmpeg-manager';

export async function GET(): Promise<Response> {
  const manager = getFFmpegManager();
  const stats = manager.getStats();

  return NextResponse.json({
    status: 'ok',
    ffmpeg: {
      activeProcesses: stats.activeCount,
      processes: stats.processes.map((p) => ({
        id: p.id,
        pid: p.pid,
        runtimeSeconds: Math.round(p.runtimeMs / 1000),
        runtimeMinutes: Math.round(p.runtimeMs / 60000),
        context: p.context,
      })),
    },
    timestamp: new Date().toISOString(),
  });
}
