/**
 * TURN Credentials Service
 *
 * Generates time-limited TURN credentials using HMAC-SHA1
 * These credentials are used by WebTorrent for WebRTC NAT traversal
 *
 * The credentials follow the TURN REST API specification:
 * - Username: {timestamp}:{userId}
 * - Credential: HMAC-SHA1(secret, username) encoded as base64
 *
 * This is more secure than static credentials because:
 * 1. Credentials expire after TTL
 * 2. Each user gets unique credentials
 * 3. The secret never leaves the server
 */

import { createHmac } from 'crypto';

/**
 * TURN credentials for WebRTC
 */
export interface TurnCredentials {
  /** Username in format {timestamp}:{userId} */
  username: string;
  /** HMAC-SHA1 credential encoded as base64 */
  credential: string;
  /** Time-to-live in seconds */
  ttl: number;
}

/**
 * ICE server configuration for WebRTC
 */
export interface TurnIceServer {
  /** TURN/STUN URLs */
  urls: string[];
  /** Username for authentication */
  username: string;
  /** Credential for authentication */
  credential: string;
}

/**
 * Default TTL for TURN credentials (24 hours)
 */
const DEFAULT_TTL_SECONDS = 86400;

/**
 * Generate time-limited TURN credentials using HMAC-SHA1
 *
 * @param userId - Optional user identifier (defaults to 'anonymous')
 * @returns TURN credentials with username, credential, and TTL
 * @throws Error if TURN_SECRET is not configured
 */
export function generateTurnCredentials(userId?: string): TurnCredentials {
  const secret = process.env.TURN_SECRET;

  if (!secret) {
    throw new Error('TURN_SECRET environment variable is required');
  }

  const ttl = parseInt(process.env.TURN_CREDENTIAL_TTL ?? '', 10) || DEFAULT_TTL_SECONDS;
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId ?? 'anonymous'}`;

  // Generate HMAC-SHA1 credential
  const hmac = createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  return {
    username,
    credential,
    ttl,
  };
}

/**
 * Get ICE servers configuration with TURN credentials
 *
 * Returns an array of ICE server configurations that can be passed
 * directly to WebRTC or WebTorrent.
 *
 * @param userId - Optional user identifier for credential generation
 * @returns Array of ICE server configurations, empty if TURN is not configured
 */
export function getTurnIceServers(userId?: string): TurnIceServer[] {
  const turnServerUrl = process.env.NEXT_PUBLIC_TURN_SERVER_URL;
  const secret = process.env.TURN_SECRET;

  // Return empty array if TURN is not configured
  if (!turnServerUrl || !secret) {
    return [];
  }

  // Parse the TURN URL to extract host and port
  // Format: turn:hostname:port or turn:hostname
  const urlMatch = turnServerUrl.match(/^turn:([^:]+)(?::(\d+))?$/);
  if (!urlMatch) {
    console.warn('[turn-credentials] Invalid TURN_SERVER_URL format:', turnServerUrl);
    return [];
  }

  const host = urlMatch[1];
  const port = urlMatch[2] ?? '3478';

  const credentials = generateTurnCredentials(userId);

  return [
    {
      urls: [
        // STUN for NAT discovery (no auth needed, but same server)
        `stun:${host}:${port}`,
        // TURN over UDP (primary)
        `turn:${host}:${port}`,
        // TURN over TCP (fallback for restrictive firewalls)
        `turn:${host}:${port}?transport=tcp`,
      ],
      username: credentials.username,
      credential: credentials.credential,
    },
  ];
}
