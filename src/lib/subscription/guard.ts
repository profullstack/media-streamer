/**
 * Subscription Guard
 * 
 * Middleware-like function to protect API routes that require an active subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isSubscriptionActive } from './check';

const AUTH_COOKIE_NAME = 'sb-auth-token';

interface SessionToken {
  access_token: string;
  refresh_token: string;
}

function parseSessionCookie(cookieValue: string | undefined): SessionToken | null {
  if (!cookieValue) return null;
  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'access_token' in parsed && 'refresh_token' in parsed &&
      typeof parsed.access_token === 'string' && typeof parsed.refresh_token === 'string'
    ) {
      return parsed as SessionToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check that the request comes from a user with an active subscription.
 * Returns null if subscription is active (allow request to proceed).
 * Returns a NextResponse (403) if subscription is expired.
 * Returns a NextResponse (401) if not authenticated.
 */
export async function requireActiveSubscription(request: NextRequest): Promise<NextResponse | null> {
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionToken = parseSessionCookie(cookieValue);

  if (!sessionToken) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: sessionToken.access_token,
    refresh_token: sessionToken.refresh_token,
  });

  if (sessionError) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid session' },
      { status: 401 }
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid session' },
      { status: 401 }
    );
  }

  const result = await isSubscriptionActive(user.id);

  if (!result.active) {
    return NextResponse.json(
      {
        error: 'subscription_expired',
        message: result.trialExpired
          ? 'Your free trial has expired. Please subscribe to continue.'
          : 'Your subscription has expired. Please renew to continue.',
        tier: result.tier,
        expired: result.expired,
        trialExpired: result.trialExpired,
      },
      { status: 403 }
    );
  }

  return null; // Subscription is active, allow request
}
