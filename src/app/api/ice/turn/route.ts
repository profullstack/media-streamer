/**
 * TURN Credentials API Route
 *
 * Provides time-limited TURN credentials for WebRTC NAT traversal
 * Used by WebTorrent for P2P streaming through firewalls
 *
 * GET /api/turn-credentials
 * Returns: { iceServers: TurnIceServer[], ttl: number }
 */

import { NextResponse } from 'next/server';
import { getTurnIceServers } from '@/lib/turn-credentials';

/**
 * Response type for TURN credentials endpoint
 */
interface TurnCredentialsResponse {
  iceServers: Array<{
    urls: string[];
    username: string;
    credential: string;
  }>;
  ttl: number;
}

/**
 * GET /api/turn-credentials
 *
 * Returns ICE servers configuration with time-limited TURN credentials
 * Credentials are generated using HMAC-SHA1 and expire after TTL
 */
export async function GET(): Promise<NextResponse<TurnCredentialsResponse>> {
  // Get ICE servers with credentials
  // Uses 'anonymous' as user ID since we don't require authentication
  // In a production app, you might want to use the authenticated user's ID
  const iceServers = getTurnIceServers('anonymous');

  // Get TTL from environment or use default
  const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL ?? '', 10) || 86400;

  // Calculate cache max-age (slightly less than TTL to ensure fresh credentials)
  const cacheMaxAge = Math.max(60, Math.floor(ttl * 0.9));

  const response = NextResponse.json<TurnCredentialsResponse>({
    iceServers,
    ttl,
  });

  // Set cache headers
  // - private: credentials are user-specific (even if anonymous)
  // - max-age: cache for most of the TTL period
  // - must-revalidate: ensure fresh credentials after expiry
  response.headers.set(
    'Cache-Control',
    `private, max-age=${cacheMaxAge}, must-revalidate`
  );

  // Set CORS headers for browser access
  // This endpoint needs to be accessible from the browser for WebTorrent
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

  return response;
}
