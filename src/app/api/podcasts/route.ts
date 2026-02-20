/**
 * Podcast API Route
 *
 * GET /api/podcasts - Search podcasts or get user subscriptions
 * POST /api/podcasts - Subscribe to a podcast
 * DELETE /api/podcasts - Unsubscribe from a podcast
 *
 * Requires authentication for subscription operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getPodcastService } from '@/lib/podcasts';
import { getActiveProfileId } from '@/lib/profiles';
import type { UserPodcastSubscription } from '@/lib/podcasts/repository';

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
 * Request body for subscribing to a podcast
 */
interface SubscribeRequest {
  feedUrl: string;
  notifyNewEpisodes?: boolean;
}

/**
 * Transformed subscription response for frontend
 * Matches the SubscribedPodcast interface expected by the frontend
 */
interface SubscribedPodcastResponse {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  website: string | null;
  subscribedAt: string;
  notificationsEnabled: boolean;
}

/**
 * Transform UserPodcastSubscription (snake_case) to SubscribedPodcastResponse (camelCase)
 * for frontend consumption
 */
function transformSubscription(sub: UserPodcastSubscription): SubscribedPodcastResponse {
  return {
    id: sub.podcast_id,
    title: sub.podcast_title,
    author: sub.podcast_author,
    description: sub.podcast_description ?? null,
    imageUrl: sub.podcast_image_url,
    feedUrl: sub.podcast_feed_url,
    website: sub.podcast_website_url ?? null,
    subscribedAt: sub.subscribed_at,
    notificationsEnabled: sub.notify_new_episodes,
  };
}

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
 * Type guard for SubscribeRequest
 */
function isSubscribeRequest(body: unknown): body is SubscribeRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.feedUrl === 'string' &&
    (obj.notifyNewEpisodes === undefined || typeof obj.notifyNewEpisodes === 'boolean')
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
 * GET /api/podcasts
 * 
 * Query parameters:
 * - q: Search query (optional) - if provided, searches podcasts
 * 
 * Without query parameter, returns user's subscriptions (requires auth)
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  const service = getPodcastService();

  // If search query is provided, search podcasts (no auth required)
  if (query !== null) {
    const results = await service.searchPodcasts(query);
    return NextResponse.json({ results });
  }

  // Otherwise, get user's subscriptions (auth required, profile-scoped)
  const profileId = await getActiveProfileId();
  
  if (!profileId) {
    return NextResponse.json(
      { error: 'No profile selected' },
      { status: 400 }
    );
  }

  try {
    // Subscriptions are per-profile
    const subscriptions = await service.getUserSubscriptions(profileId);
    // Transform snake_case to camelCase for frontend consumption
    const transformedSubscriptions = subscriptions.map(transformSubscription);
    return NextResponse.json({ subscriptions: transformedSubscriptions });
  } catch (error) {
    console.error('[Podcasts] Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/podcasts
 * 
 * Subscribe to a podcast by feed URL.
 * 
 * Request body:
 * - feedUrl: (required) URL to the podcast RSS feed
 * - notifyNewEpisodes: (optional) Whether to receive notifications for new episodes (default: true)
 * 
 * Returns:
 * - 200: Subscription created successfully
 * - 400: Invalid request (missing fields, invalid URL)
 * - 401: Authentication required
 * - 404: Could not parse podcast feed
 */
export async function POST(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  
  if (!profileId) {
    return NextResponse.json(
      { error: 'No profile selected' },
      { status: 400 }
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

  if (!isSubscribeRequest(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.feedUrl !== 'string' || !obj.feedUrl) {
      return NextResponse.json(
        { error: 'Missing required field: feedUrl' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const feedUrl = body.feedUrl.trim();
  const notifyNewEpisodes = body.notifyNewEpisodes ?? true;

  if (!feedUrl) {
    return NextResponse.json(
      { error: 'Missing required field: feedUrl' },
      { status: 400 }
    );
  }

  if (!isValidUrl(feedUrl)) {
    return NextResponse.json(
      { error: 'Invalid feedUrl: must be a valid HTTP or HTTPS URL' },
      { status: 400 }
    );
  }

  try {
    const service = getPodcastService();
    const subscription = await service.subscribeToPodcast(profileId, feedUrl, notifyNewEpisodes);

    if (!subscription) {
      return NextResponse.json(
        { error: 'Could not parse podcast feed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('[Podcasts] Error subscribing to podcast:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to podcast' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/podcasts
 * 
 * Unsubscribe from a podcast.
 * 
 * Query parameters:
 * - podcastId: (required) ID of the podcast to unsubscribe from
 * 
 * Returns:
 * - 200: Unsubscribed successfully
 * - 400: Missing podcastId
 * - 401: Authentication required
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const profileId = await getActiveProfileId();
  
  if (!profileId) {
    return NextResponse.json(
      { error: 'No profile selected' },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const podcastId = searchParams.get('podcastId');

  if (!podcastId) {
    return NextResponse.json(
      { error: 'Missing required parameter: podcastId' },
      { status: 400 }
    );
  }

  try {
    const service = getPodcastService();
    await service.unsubscribeFromPodcast(profileId, podcastId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Podcasts] Error unsubscribing from podcast:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe from podcast' },
      { status: 500 }
    );
  }
}
