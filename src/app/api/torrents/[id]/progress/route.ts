/**
 * Torrent File Progress API Route
 *
 * GET /api/torrents/[id]/progress - Get progress for all files in a torrent
 * POST /api/torrents/[id]/progress - Update progress for a specific file
 *
 * Requires authentication. Only for logged-in users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Completion threshold - 95% watched/read = completed
 */
const COMPLETION_THRESHOLD = 0.95;

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
 * Request body for updating watch progress
 */
interface UpdateWatchProgressRequest {
  fileId: string;
  currentTimeSeconds: number;
  durationSeconds?: number;
}

/**
 * Request body for updating reading progress
 */
interface UpdateReadingProgressRequest {
  fileId: string;
  currentPage: number;
  totalPages?: number;
}

/**
 * Type guard for UpdateWatchProgressRequest
 */
function isUpdateWatchProgressRequest(body: unknown): body is UpdateWatchProgressRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.fileId === 'string' &&
    typeof obj.currentTimeSeconds === 'number' &&
    (obj.durationSeconds === undefined || typeof obj.durationSeconds === 'number')
  );
}

/**
 * Type guard for UpdateReadingProgressRequest
 */
function isUpdateReadingProgressRequest(body: unknown): body is UpdateReadingProgressRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.fileId === 'string' &&
    typeof obj.currentPage === 'number' &&
    (obj.totalPages === undefined || typeof obj.totalPages === 'number')
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
 * GET /api/torrents/[id]/progress
 *
 * Get progress for all files in a torrent.
 *
 * Returns:
 * - 200: Object with watchProgress and readingProgress arrays
 * - 401: Authentication required
 * - 404: Torrent not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { id: torrentId } = await params;

  try {
    const supabase = createServerClient();

    // Get all files for this torrent
    const { data: files, error: filesError } = await supabase
      .from('bt_torrent_files')
      .select('id')
      .eq('torrent_id', torrentId);

    if (filesError) {
      console.error('[Progress] Error fetching files:', filesError);
      return NextResponse.json(
        { error: 'Failed to fetch torrent files' },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      // Return empty progress for torrents with no files
      return NextResponse.json({
        watchProgress: [],
        readingProgress: [],
      });
    }

    const fileIds = files.map(f => f.id);

    // Fetch watch progress for all files
    const { data: watchProgress, error: watchError } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .in('file_id', fileIds);

    if (watchError) {
      console.error('[Progress] Error fetching watch progress:', watchError);
    }

    // Fetch reading progress for all files
    const { data: readingProgress, error: readingError } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId)
      .in('file_id', fileIds);

    if (readingError) {
      console.error('[Progress] Error fetching reading progress:', readingError);
    }

    return NextResponse.json({
      watchProgress: (watchProgress ?? []).map(wp => ({
        fileId: wp.file_id,
        currentTimeSeconds: wp.current_time_seconds ?? 0,
        durationSeconds: wp.duration_seconds,
        percentage: wp.percentage ?? 0,
        lastWatchedAt: wp.last_watched_at,
      })),
      readingProgress: (readingProgress ?? []).map(rp => ({
        fileId: rp.file_id,
        currentPage: rp.current_page ?? 0,
        totalPages: rp.total_pages,
        percentage: rp.percentage ?? 0,
        lastReadAt: rp.last_read_at,
      })),
    });
  } catch (error) {
    console.error('[Progress] Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/torrents/[id]/progress
 *
 * Update progress for a specific file.
 *
 * Request body (watch progress):
 * - fileId: (required) ID of the file
 * - currentTimeSeconds: (required) Current playback position in seconds
 * - durationSeconds: (optional) Total duration of the file in seconds
 *
 * Request body (reading progress):
 * - fileId: (required) ID of the file
 * - currentPage: (required) Current page number
 * - totalPages: (optional) Total pages in the book
 *
 * Returns:
 * - 200: Progress updated successfully
 * - 400: Invalid request body
 * - 401: Authentication required
 * - 404: File not found or doesn't belong to torrent
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { id: torrentId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Check if it's watch progress (has currentTimeSeconds)
  if (isUpdateWatchProgressRequest(body)) {
    const { fileId, currentTimeSeconds, durationSeconds } = body;

    // Verify file belongs to torrent
    const { data: file, error: fileError } = await supabase
      .from('bt_torrent_files')
      .select('id, torrent_id')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    if (file.torrent_id !== torrentId) {
      return NextResponse.json(
        { error: 'File does not belong to this torrent' },
        { status: 400 }
      );
    }

    // Calculate percentage
    const percentage = durationSeconds && durationSeconds > 0
      ? Math.min((currentTimeSeconds / durationSeconds) * 100, 100)
      : 0;

    // Upsert watch progress
    const { data: progress, error: upsertError } = await supabase
      .from('watch_progress')
      .upsert(
        {
          user_id: userId,
          file_id: fileId,
          current_time_seconds: Math.floor(currentTimeSeconds),
          duration_seconds: durationSeconds ? Math.floor(durationSeconds) : null,
          percentage: Math.round(percentage * 100) / 100,
          last_watched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,file_id' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('[Progress] Error upserting watch progress:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      progress: {
        id: progress.id,
        fileId: progress.file_id,
        currentTimeSeconds: progress.current_time_seconds,
        durationSeconds: progress.duration_seconds,
        percentage: progress.percentage,
        completed: (progress.percentage ?? 0) >= COMPLETION_THRESHOLD * 100,
        lastWatchedAt: progress.last_watched_at,
      },
    });
  }

  // Check if it's reading progress (has currentPage)
  if (isUpdateReadingProgressRequest(body)) {
    const { fileId, currentPage, totalPages } = body;

    // Verify file belongs to torrent
    const { data: file, error: fileError } = await supabase
      .from('bt_torrent_files')
      .select('id, torrent_id')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    if (file.torrent_id !== torrentId) {
      return NextResponse.json(
        { error: 'File does not belong to this torrent' },
        { status: 400 }
      );
    }

    // Calculate percentage
    const percentage = totalPages && totalPages > 0
      ? Math.min((currentPage / totalPages) * 100, 100)
      : 0;

    // Upsert reading progress
    const { data: progress, error: upsertError } = await supabase
      .from('reading_progress')
      .upsert(
        {
          user_id: userId,
          file_id: fileId,
          current_page: currentPage,
          total_pages: totalPages ?? null,
          percentage: Math.round(percentage * 100) / 100,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,file_id' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('[Progress] Error upserting reading progress:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      progress: {
        id: progress.id,
        fileId: progress.file_id,
        currentPage: progress.current_page,
        totalPages: progress.total_pages,
        percentage: progress.percentage,
        completed: (progress.percentage ?? 0) >= COMPLETION_THRESHOLD * 100,
        lastReadAt: progress.last_read_at,
      },
    });
  }

  return NextResponse.json(
    { error: 'Invalid request body - must include fileId and either currentTimeSeconds or currentPage' },
    { status: 400 }
  );
}
