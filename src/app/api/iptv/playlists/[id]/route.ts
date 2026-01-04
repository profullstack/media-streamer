/**
 * IPTV Playlist Individual Route
 *
 * GET /api/iptv/playlists/[id] - Get a specific playlist
 * PUT /api/iptv/playlists/[id] - Update a playlist
 * DELETE /api/iptv/playlists/[id] - Delete a playlist
 *
 * Requires authentication via HTTP-only cookie or Authorization header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { Agent } from 'undici';

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
 * Request body for updating a playlist
 */
interface UpdatePlaylistRequest {
  name?: string;
  m3uUrl?: string;
  epgUrl?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
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
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Route params
 */
interface RouteParams {
  params: Promise<{ id: string }>;
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
 * Type guard for UpdatePlaylistRequest
 */
function isUpdatePlaylistRequest(body: unknown): body is UpdatePlaylistRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    (obj.name === undefined || typeof obj.name === 'string') &&
    (obj.m3uUrl === undefined || typeof obj.m3uUrl === 'string') &&
    (obj.epgUrl === undefined || obj.epgUrl === null || typeof obj.epgUrl === 'string') &&
    (obj.isActive === undefined || typeof obj.isActive === 'boolean') &&
    (obj.isDefault === undefined || typeof obj.isDefault === 'boolean')
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
 * Transform database row to API response
 */
function transformPlaylist(row: {
  id: string;
  name: string;
  m3u_url: string;
  epg_url: string | null;
  is_active: boolean;
  is_default?: boolean;
  created_at: string;
  updated_at: string;
}): PlaylistResponse {
  return {
    id: row.id,
    name: row.name,
    m3uUrl: row.m3u_url,
    epgUrl: row.epg_url ?? undefined,
    isActive: row.is_active,
    isDefault: row.is_default ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/iptv/playlists/[id]
 * 
 * Returns a specific playlist for the authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id } = await params;
  const userId = await getUserIdFromRequest(request);
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from('iptv_playlists')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Playlist not found' },
        { status: 404 }
      );
    }
    console.error('[IPTV Playlists] Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }

  return NextResponse.json(transformPlaylist(data));
}

/**
 * PUT /api/iptv/playlists/[id]
 * 
 * Updates a playlist. Only provided fields are updated.
 * 
 * Request body (all optional):
 * - name: Display name for the playlist
 * - m3uUrl: URL to the M3U playlist file (will be validated)
 * - epgUrl: URL to the EPG XML file (null to remove)
 * - isActive: Whether the playlist is active
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id } = await params;
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

  if (!isUpdatePlaylistRequest(body)) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};
  
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: 'Name cannot be empty' },
        { status: 400 }
      );
    }
    updateData.name = name;
  }

  if (body.m3uUrl !== undefined) {
    const m3uUrl = body.m3uUrl.trim();
    if (!m3uUrl) {
      return NextResponse.json(
        { error: 'm3uUrl cannot be empty' },
        { status: 400 }
      );
    }
    if (!isValidUrl(m3uUrl)) {
      return NextResponse.json(
        { error: 'Invalid m3uUrl: must be a valid HTTP or HTTPS URL' },
        { status: 400 }
      );
    }

    // Validate that the M3U URL is accessible
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
          'Range': 'bytes=0-1023',
        },
        dispatcher: insecureAgent,
      });

      clearTimeout(timeoutId);

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

    updateData.m3u_url = m3uUrl;
  }

  if (body.epgUrl !== undefined) {
    if (body.epgUrl === null) {
      updateData.epg_url = null;
    } else {
      const epgUrl = body.epgUrl.trim();
      if (epgUrl && !isValidUrl(epgUrl)) {
        return NextResponse.json(
          { error: 'Invalid epgUrl: must be a valid HTTP or HTTPS URL' },
          { status: 400 }
        );
      }
      updateData.epg_url = epgUrl || null;
    }
  }

  if (body.isActive !== undefined) {
    updateData.is_active = body.isActive;
  }

  if (body.isDefault !== undefined) {
    updateData.is_default = body.isDefault;
  }

  // Check if there's anything to update
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400 }
    );
  }

  // Add updated_at timestamp
  updateData.updated_at = new Date().toISOString();

  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from('iptv_playlists')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Playlist not found' },
        { status: 404 }
      );
    }
    console.error('[IPTV Playlists] Error updating playlist:', error);
    return NextResponse.json(
      { error: 'Failed to update playlist' },
      { status: 500 }
    );
  }

  return NextResponse.json(transformPlaylist(data));
}

/**
 * DELETE /api/iptv/playlists/[id]
 * 
 * Deletes a playlist.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id } = await params;
  const userId = await getUserIdFromRequest(request);
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  
  // First check if the playlist exists and belongs to the user
  const { data: existing, error: checkError } = await supabase
    .from('iptv_playlists')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (checkError || !existing) {
    return NextResponse.json(
      { error: 'Playlist not found' },
      { status: 404 }
    );
  }

  // Delete the playlist
  const { error } = await supabase
    .from('iptv_playlists')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('[IPTV Playlists] Error deleting playlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete playlist' },
      { status: 500 }
    );
  }

  return new Response(null, { status: 204 });
}
