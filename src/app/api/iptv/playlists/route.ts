/**
 * IPTV Playlists API Route
 *
 * GET /api/iptv/playlists - List user's playlists (includes family owner's playlists for family members)
 * POST /api/iptv/playlists - Create a new playlist
 *
 * Requires authentication via HTTP-only cookie. Playlists are stored in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { IptvPlaylistInsert } from '@/lib/supabase/types';
import { Agent } from 'undici';
import { getFamilyPlanRepository } from '@/lib/family';

/**
 * Cookie name for auth token
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

/**
 * Session token structure stored in cookie
 */
interface SessionToken {
  access_token: string;
  refresh_token: string;
}

/**
 * Request body for creating a playlist
 */
interface CreatePlaylistRequest {
  name: string;
  m3uUrl: string;
  epgUrl?: string;
}

/**
 * Response data for a playlist
 */
interface PlaylistResponse {
  id: string;
  name: string;
  m3uUrl: string;
  epgUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request timeout for validating M3U URL
 */
const VALIDATION_TIMEOUT = 10000;

/**
 * Custom undici Agent that skips SSL certificate validation.
 * This is necessary because many IPTV providers have misconfigured SSL certificates.
 * WARNING: This disables certificate validation for M3U URL validation requests only.
 */
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

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
 * Parse session token from cookie
 */
function parseSessionCookie(cookieValue: string | undefined): SessionToken | null {
  if (!cookieValue) return null;

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as unknown;
    
    // Validate structure
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'access_token' in parsed &&
      'refresh_token' in parsed &&
      typeof (parsed as SessionToken).access_token === 'string' &&
      typeof (parsed as SessionToken).refresh_token === 'string'
    ) {
      return parsed as SessionToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract user ID from session cookie or Authorization header
 * Supports both cookie-based auth (browser) and header-based auth (tests/API clients)
 */
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  // First try cookie-based auth (browser)
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionToken = parseSessionCookie(cookieValue);
  
  if (sessionToken) {
    const supabase = createServerClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: sessionToken.access_token,
      refresh_token: sessionToken.refresh_token,
    });

    if (!sessionError) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user) {
        return user.id;
      }
    }
  }

  // Fall back to Authorization header (for tests and API clients)
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  try {
    // Parse the session token (it's a JSON object with access_token)
    const sessionData = JSON.parse(token) as { access_token?: string };
    if (!sessionData.access_token) {
      return null;
    }

    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(sessionData.access_token);
    
    if (error || !user) {
      return null;
    }

    return user.id;
  } catch {
    // Token might be a direct access token
    try {
      const supabase = createServerClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return null;
      }

      return user.id;
    } catch {
      return null;
    }
  }
}

/**
 * Extended playlist response with ownership info
 */
interface PlaylistResponseWithOwner extends PlaylistResponse {
  isOwner: boolean;
  ownerEmail?: string;
}

/**
 * Transform database row to API response
 */
function transformPlaylist(row: {
  id: string;
  name: string;
  m3u_url: string;
  epg_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): PlaylistResponse {
  return {
    id: row.id,
    name: row.name,
    m3uUrl: row.m3u_url,
    epgUrl: row.epg_url ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform database row to API response with ownership info
 */
function transformPlaylistWithOwner(
  row: {
    id: string;
    name: string;
    m3u_url: string;
    epg_url: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  },
  isOwner: boolean,
  ownerEmail?: string
): PlaylistResponseWithOwner {
  return {
    ...transformPlaylist(row),
    isOwner,
    ownerEmail,
  };
}

/**
 * GET /api/iptv/playlists
 *
 * Returns all playlists for the authenticated user.
 * For family members, also includes playlists from the family owner.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const userId = await getUserIdFromRequest(request);
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  
  // Get user's own playlists
  const { data: ownPlaylists, error: ownError } = await supabase
    .from('iptv_playlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (ownError) {
    console.error('[IPTV Playlists] Error fetching playlists:', ownError);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }

  // Check if user is a family member and get owner's playlists
  let familyOwnerPlaylists: PlaylistResponseWithOwner[] = [];
  
  try {
    const familyRepo = getFamilyPlanRepository();
    const familyOwnerId = await familyRepo.getFamilyOwnerId(userId);
    
    // If user is a family member (not the owner), fetch owner's playlists
    if (familyOwnerId && familyOwnerId !== userId) {
      // Get owner's email for display
      const familyPlan = await familyRepo.getFamilyPlan(userId);
      const ownerEmail = familyPlan?.ownerEmail;
      
      const { data: ownerPlaylists, error: ownerError } = await supabase
        .from('iptv_playlists')
        .select('*')
        .eq('user_id', familyOwnerId)
        .order('created_at', { ascending: false });

      if (!ownerError && ownerPlaylists) {
        familyOwnerPlaylists = ownerPlaylists.map(row =>
          transformPlaylistWithOwner(row, false, ownerEmail)
        );
      }
    }
  } catch (error) {
    // Log but don't fail - family feature is optional
    console.error('[IPTV Playlists] Error fetching family playlists:', error);
  }

  // Combine own playlists (marked as owner) with family owner's playlists
  const ownPlaylistsWithOwner = ownPlaylists.map(row =>
    transformPlaylistWithOwner(row, true)
  );
  
  const allPlaylists = [...ownPlaylistsWithOwner, ...familyOwnerPlaylists];

  return NextResponse.json({ playlists: allPlaylists });
}

/**
 * POST /api/iptv/playlists
 * 
 * Creates a new IPTV playlist after validating the M3U URL is accessible.
 * 
 * Request body:
 * - name: (required) Display name for the playlist
 * - m3uUrl: (required) URL to the M3U playlist file
 * - epgUrl: (optional) URL to the EPG XML file
 * 
 * Returns:
 * - 200: Playlist created successfully
 * - 400: Invalid request (missing fields, invalid URLs)
 * - 401: Authentication required
 * - 502: M3U URL is not accessible
 * - 504: M3U URL validation timed out
 */
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getUserIdFromRequest(request);
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

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
  // Use GET instead of HEAD because many M3U servers don't support HEAD requests
  // Use insecure agent to skip SSL certificate validation (many IPTV providers have misconfigured certs)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

    // Use undici fetch with insecure agent to skip SSL certificate validation
    const { fetch: undiciFetch } = await import('undici');
    const response = await undiciFetch(m3uUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IPTV/1.0)',
        // Request only a small range to minimize data transfer
        'Range': 'bytes=0-1023',
      },
      dispatcher: insecureAgent,
    });

    clearTimeout(timeoutId);

    // Accept 200 OK or 206 Partial Content (for Range requests)
    if (!response.ok && response.status !== 206) {
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

  // Insert into database
  const supabase = createServerClient();
  
  const insertData: IptvPlaylistInsert = {
    user_id: userId,
    name,
    m3u_url: m3uUrl,
    epg_url: epgUrl ?? null,
    is_active: false,
  };

  const { data, error } = await supabase
    .from('iptv_playlists')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[IPTV Playlists] Error creating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to create playlist' },
      { status: 500 }
    );
  }

  return NextResponse.json(transformPlaylist(data));
}
