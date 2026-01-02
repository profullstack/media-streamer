/**
 * IPTV Playlists API Route
 * 
 * POST /api/iptv/playlists
 * 
 * Validates and creates IPTV playlist entries.
 * Validates that the M3U URL is accessible before returning success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * Request body for creating a playlist
 */
interface CreatePlaylistRequest {
  name: string;
  m3uUrl: string;
  epgUrl?: string;
}

/**
 * Response data for a created playlist
 */
interface PlaylistResponse {
  id: string;
  name: string;
  m3uUrl: string;
  epgUrl?: string;
}

/**
 * Request timeout for validating M3U URL
 */
const VALIDATION_TIMEOUT = 10000;

/**
 * Validates if a string is a valid HTTP/HTTPS URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Type guard for CreatePlaylistRequest
 */
function isCreatePlaylistRequest(body: unknown): body is CreatePlaylistRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.m3uUrl === 'string' &&
    (obj.epgUrl === undefined || typeof obj.epgUrl === 'string')
  );
}

/**
 * POST /api/iptv/playlists
 * 
 * Creates a new IPTV playlist entry after validating the M3U URL is accessible.
 * 
 * Request body:
 * - name: (required) Display name for the playlist
 * - m3uUrl: (required) URL to the M3U playlist file
 * - epgUrl: (optional) URL to the EPG XML file
 * 
 * Returns:
 * - 200: Playlist created successfully with id, name, m3uUrl, and optional epgUrl
 * - 400: Invalid request (missing fields, invalid URLs)
 * - 502: M3U URL is not accessible
 * - 504: M3U URL validation timed out
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (!isCreatePlaylistRequest(body)) {
    // Determine which field is missing for a more specific error
    const obj = body as Record<string, unknown>;
    if (typeof obj.name !== 'string' || !obj.name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }
    if (typeof obj.m3uUrl !== 'string' || !obj.m3uUrl) {
      return NextResponse.json(
        { error: 'Missing required field: m3uUrl' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Trim whitespace from inputs
  const name = body.name.trim();
  const m3uUrl = body.m3uUrl.trim();
  const epgUrl = body.epgUrl?.trim();

  // Validate name is not empty after trimming
  if (!name) {
    return NextResponse.json(
      { error: 'Missing required field: name' },
      { status: 400 }
    );
  }

  // Validate m3uUrl is not empty after trimming
  if (!m3uUrl) {
    return NextResponse.json(
      { error: 'Missing required field: m3uUrl' },
      { status: 400 }
    );
  }

  // Validate m3uUrl is a valid URL
  if (!isValidUrl(m3uUrl)) {
    return NextResponse.json(
      { error: 'Invalid m3uUrl: must be a valid HTTP or HTTPS URL' },
      { status: 400 }
    );
  }

  // Validate epgUrl if provided
  if (epgUrl && !isValidUrl(epgUrl)) {
    return NextResponse.json(
      { error: 'Invalid epgUrl: must be a valid HTTP or HTTPS URL' },
      { status: 400 }
    );
  }

  // Validate that the M3U URL is accessible
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

    const response = await fetch(m3uUrl, {
      method: 'HEAD', // Use HEAD to minimize data transfer
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IPTV/1.0)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to validate M3U URL: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout while validating M3U URL' },
        { status: 504 }
      );
    }

    console.error('[IPTV Playlists] Error validating M3U URL:', error);
    return NextResponse.json(
      { error: 'Failed to validate M3U URL' },
      { status: 502 }
    );
  }

  // Generate a unique ID for the playlist
  const id = randomUUID();

  // Build response
  const playlistResponse: PlaylistResponse = {
    id,
    name,
    m3uUrl,
  };

  if (epgUrl) {
    playlistResponse.epgUrl = epgUrl;
  }

  return NextResponse.json(playlistResponse);
}
