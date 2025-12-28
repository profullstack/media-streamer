/**
 * Health Check API Route
 *
 * Used for health checks and monitoring
 */

import { NextResponse } from 'next/server';

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
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
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
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
