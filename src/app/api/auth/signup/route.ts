/**
 * Signup API Route
 *
 * POST /api/auth/signup
 *
 * Creates a new user account with Supabase Auth.
 * Sends email confirmation link.
 * Creates user profile in database.
 *
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Request body for signup
 */
interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Minimum password length
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Validate password strength
 */
function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Get the base URL for email redirects
 */
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/**
 * POST /api/auth/signup
 *
 * Create a new user account.
 *
 * Request body:
 * - email: (required) User's email address
 * - password: (required) Password (min 8 characters)
 * - name: (optional) Display name
 *
 * Returns:
 * - 201: User created, confirmation email sent
 * - 400: Invalid input
 * - 409: Email already exists
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse request body
  let body: SignupRequest;
  try {
    body = await request.json() as SignupRequest;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { email, password, name } = body;

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

  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const baseUrl = getBaseUrl(request);

  // Create user with Supabase Auth
  const { data, error: signUpError } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${baseUrl}/login?confirmed=true`,
      data: {
        display_name: name ?? undefined,
      },
    },
  });

  // Handle signup errors
  if (signUpError) {
    console.error('[Signup] Supabase error:', signUpError.message);

    // Check for duplicate email
    if (
      signUpError.message.includes('already registered') ||
      signUpError.message.includes('already exists')
    ) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }

  // Check if user was created
  if (!data.user) {
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }

  // Capture signup IP from X-Forwarded-For (nginx proxy) or direct connection
  const signupIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  console.log('[Signup] New user:', { email: email.trim().toLowerCase(), userId: data.user.id, signupIp });

  // Check if this IP already has an active or expired trial (anti-abuse)
  const { data: existingTrials } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, status, signup_ip')
    .eq('signup_ip', signupIp)
    .neq('user_id', data.user.id);

  if (existingTrials && existingTrials.length > 0) {
    console.warn('[Signup] Duplicate trial attempt from same IP', {
      signupIp,
      existingCount: existingTrials.length,
      newUserId: data.user.id,
    });
    // Still allow signup but give a shorter trial (3 days instead of 14)
    // This way legitimate users sharing an IP (family, office) aren't blocked
  }

  const isRepeatIp = existingTrials && existingTrials.length > 0;
  const trialDays = isRepeatIp ? 3 : 14;

  // Create user subscription record (trial tier)
  // Use upsert to handle cases where user re-signs up (e.g., unconfirmed email retry)
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

  const { error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: data.user.id,
        tier: 'trial',
        status: 'active',
        trial_started_at: new Date().toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
        signup_ip: signupIp,
      },
      {
        onConflict: 'user_id',
        ignoreDuplicates: true, // Don't update if already exists
      }
    );

  if (subscriptionError) {
    console.error('[Signup] Subscription creation error:', subscriptionError.message);
    // Don't fail the signup if subscription creation fails
    // The subscription can be created later on first login
  }

  // Return success response
  return NextResponse.json(
    {
      message: 'Account created. Please check your email for a confirmation link.',
      user: {
        id: data.user.id,
        email: data.user.email,
        emailConfirmed: !!data.user.email_confirmed_at,
      },
    },
    { status: 201 }
  );
}
