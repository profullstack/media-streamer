/**
 * Push Subscription API Route
 *
 * POST /api/push/subscribe - Register a push subscription
 * DELETE /api/push/subscribe - Unregister a push subscription
 *
 * Requires authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getPushNotificationService, type PushSubscriptionData } from '@/lib/push-notifications';

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
 * Request body for subscribing
 */
interface SubscribeRequest {
  subscription: PushSubscriptionData;
}

/**
 * Type guard for SubscribeRequest
 */
function isSubscribeRequest(body: unknown): body is SubscribeRequest {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.subscription !== 'object' || obj.subscription === null) {
    return false;
  }
  const sub = obj.subscription as Record<string, unknown>;
  if (typeof sub.endpoint !== 'string') {
    return false;
  }
  if (typeof sub.keys !== 'object' || sub.keys === null) {
    return false;
  }
  const keys = sub.keys as Record<string, unknown>;
  return typeof keys.p256dh === 'string' && typeof keys.auth === 'string';
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
 * GET /api/push/subscribe
 * 
 * Get the VAPID public key for client-side subscription.
 * No authentication required.
 */
export async function GET(): Promise<Response> {
  try {
    const service = getPushNotificationService();
    const publicKey = service.getVapidPublicKey();
    
    return NextResponse.json({ publicKey });
  } catch (error) {
    console.error('[Push] Error getting VAPID key:', error);
    return NextResponse.json(
      { error: 'Push notifications not configured' },
      { status: 503 }
    );
  }
}

/**
 * POST /api/push/subscribe
 * 
 * Register a push subscription.
 * 
 * Request body:
 * - subscription: Push subscription object from browser
 *   - endpoint: Push service URL
 *   - keys.p256dh: Public key
 *   - keys.auth: Auth secret
 * 
 * Returns:
 * - 200: Subscription registered
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

  if (!isSubscribeRequest(body)) {
    return NextResponse.json(
      { error: 'Invalid subscription data' },
      { status: 400 }
    );
  }

  try {
    const service = getPushNotificationService();
    const userAgent = request.headers.get('User-Agent') ?? undefined;
    
    const subscription = await service.registerSubscription(
      userId,
      body.subscription,
      userAgent
    );

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error('[Push] Error registering subscription:', error);
    return NextResponse.json(
      { error: 'Failed to register subscription' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/push/subscribe
 * 
 * Unregister a push subscription.
 * 
 * Query parameters:
 * - endpoint: The push subscription endpoint to unregister
 * 
 * Returns:
 * - 200: Subscription unregistered
 * - 400: Missing endpoint
 * - 401: Authentication required
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const userId = await getUserIdFromRequest(request);
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing required parameter: endpoint' },
      { status: 400 }
    );
  }

  try {
    const service = getPushNotificationService();
    await service.unregisterSubscription(endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Push] Error unregistering subscription:', error);
    return NextResponse.json(
      { error: 'Failed to unregister subscription' },
      { status: 500 }
    );
  }
}
