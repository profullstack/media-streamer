/**
 * Podcast Listen Progress API Route
 *
 * POST /api/podcasts/progress - Update listen progress for an episode
 *
 * Requires authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getPodcastService } from '@/lib/podcasts';
import { getCurrentProfileIdWithFallback } from '@/lib/profiles';

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
 * Request body for updating progress
 */
interface UpdateProgressRequest {
  episodeId: string;
  currentTimeSeconds: number;
  durationSeconds?: number;
}

/**
 * Type guard for UpdateProgressRequest
 */
function isUpdateProgressRequest(body: unknown): body is UpdateProgressRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.episodeId === 'string' &&
    typeof obj.currentTimeSeconds === 'number' &&
    (obj.durationSeconds === undefined || typeof obj.durationSeconds === 'number')
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
 * GET /api/podcasts/progress?podcastId={id}
 *
 * Get listen progress for all episodes of a podcast.
 *
 * Query params:
 * - podcastId: (required) ID of the podcast
 *
 * Returns:
 * - 200: Array of episode progress objects
 * - 400: Missing podcastId
 * - 401: Authentication required
 */
export async function GET(request: NextRequest): Promise<Response> {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const podcastId = searchParams.get('podcastId');

  if (!podcastId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: podcastId' },
      { status: 400 }
    );
  }

  try {
    const profileId = await getCurrentProfileIdWithFallback();
    const service = getPodcastService();
    const progress = await service.getListenProgressForPodcast(profileId, podcastId);

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('[Podcasts] Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/podcasts/progress
 *
 * Update listen progress for an episode.
 *
 * Request body:
 * - episodeId: (required) ID of the episode
 * - currentTimeSeconds: (required) Current playback position in seconds
 * - durationSeconds: (optional) Total duration of the episode in seconds
 *
 * Returns:
 * - 200: Progress updated successfully
 * - 400: Invalid request body
 * - 401: Authentication required
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

  if (!isUpdateProgressRequest(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.episodeId !== 'string' || !obj.episodeId) {
      return NextResponse.json(
        { error: 'Missing required field: episodeId' },
        { status: 400 }
      );
    }
    if (typeof obj.currentTimeSeconds !== 'number') {
      return NextResponse.json(
        { error: 'Missing required field: currentTimeSeconds' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    const profileId = await getCurrentProfileIdWithFallback();
    const service = getPodcastService();
    const progress = await service.updateListenProgress({
      userId: profileId,
      episodeId: body.episodeId,
      currentTimeSeconds: body.currentTimeSeconds,
      durationSeconds: body.durationSeconds,
    });

    return NextResponse.json({
      progress: {
        id: progress.id,
        episodeId: progress.episode_id,
        currentTimeSeconds: progress.current_time_seconds,
        durationSeconds: progress.duration_seconds,
        percentage: progress.percentage,
        completed: progress.completed,
        lastListenedAt: progress.last_listened_at,
      },
    });
  } catch (error) {
    console.error('[Podcasts] Error updating progress:', error);
    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}
