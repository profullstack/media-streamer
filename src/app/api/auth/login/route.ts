/**
 * Login API Route
 *
 * POST /api/auth/login
 *
 * Authenticates a user with Supabase Auth.
 * Sets HTTP-only cookie with session token.
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Request body for login
 */
interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Cookie name for auth token
 */
const AUTH_COOKIE_NAME = 'sb-auth-token';

/**
 * Cookie max age in seconds (7 days)
 */
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * POST /api/auth/login
 *
 * Authenticate a user.
 *
 * Request body:
 * - email: (required) User's email address
 * - password: (required) Password
 *
 * Returns:
 * - 200: Login successful, session created
 * - 400: Invalid input
 * - 401: Invalid credentials or unconfirmed email
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse request body
  let body: LoginRequest;
  try {
    body = await request.json() as LoginRequest;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { email, password } = body;

  // Validate email
  if (!email) {
    return NextResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Invalid email format' },
      { status: 400 }
    );
  }

  // Validate password
  if (!password) {
    return NextResponse.json(
      { error: 'Password is required' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Authenticate with Supabase
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  // Handle authentication errors
  if (signInError) {
    console.error('[Login] Supabase error:', signInError.message);

    // Check for specific error types
    if (signInError.message.includes('Invalid login credentials')) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (signInError.message.includes('Email not confirmed')) {
      return NextResponse.json(
        { error: 'Please confirm your email address before logging in' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 401 }
    );
  }

  // Check if user and session exist
  if (!data.user || !data.session) {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }

  // Get user subscription info
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('tier, status')
    .eq('user_id', data.user.id)
    .single();

  // Build response with user info
  const response = NextResponse.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
        emailConfirmed: !!data.user.email_confirmed_at,
        displayName: data.user.user_metadata?.display_name as string | undefined,
        subscriptionTier: subscription?.tier ?? 'trial',
        subscriptionStatus: subscription?.status ?? 'active',
      },
      session: {
        expiresAt: data.session.expires_at,
      },
    },
    { status: 200 }
  );

  // Set HTTP-only cookie with session token
  // This cookie will be sent with subsequent requests for authentication
  const cookieValue = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  response.headers.set(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );

  return response;
}
