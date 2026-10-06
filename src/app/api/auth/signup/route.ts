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
import { isOpenInvite, normalizeInviteCode } from '@/lib/invites';

/**
 * Request body for signup
 */
interface SignupRequest {
  email: string;
  password: string;
  name?: string;
  inviteCode?: string;
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
 * - inviteCode: (required) An unused invite; the site is invite only
 *
 * Returns:
 * - 201: User created, confirmation email sent
 * - 400: Invalid input, or a missing, unknown or used invite code
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
  const inviteCode = normalizeInviteCode(body.inviteCode);

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

  // Invite only. This check is for a clear message; the a_consume_invite_on_signup
  // trigger on auth.users is what enforces it, for this route and every other way in.
  if (!inviteCode) {
    return NextResponse.json(
      { error: 'An invite code is required to sign up' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const baseUrl = getBaseUrl(request);

  if (!(await isOpenInvite(supabase, inviteCode))) {
    return NextResponse.json(
      { error: 'That invite code is invalid or has already been used' },
      { status: 400 }
    );
  }

  // Create user with Supabase Auth
  const { data, error: signUpError } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${baseUrl}/login?confirmed=true`,
      data: {
        display_name: name ?? undefined,
        invite_code: inviteCode,
      },
    },
  });

  // Handle signup errors
  if (signUpError) {
    console.error('[Signup] Supabase error:', signUpError.message);

    // The trigger refused the code: someone used it between our check and the insert.
    if (signUpError.message.includes('invite_') || signUpError.message.includes('Database error saving new user')) {
      return NextResponse.json(
        { error: 'That invite code is invalid or has already been used' },
        { status: 400 }
      );
    }

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

  const existingCount = existingTrials?.length ?? 0;

  if (existingCount >= 5) {
    console.error('[Signup] IP BANNED — 5+ accounts from same IP', {
      signupIp,
      existingCount,
      newUserId: data.user.id,
      email: email.trim().toLowerCase(),
    });

    // Ban the user account
    try {
      await supabase.auth.admin.updateUserById(data.user.id, {
        ban_duration: '876000h', // ~100 years
      });
    } catch (banErr) {
      console.error('[Signup] Failed to ban user', banErr);
    }

    // Send ban notification email
    try {
      const { getEmailService } = await import('@/lib/email/email');
      const emailService = getEmailService();
      await emailService.sendIPBanNotice({
        to: email.trim().toLowerCase(),
        ip: signupIp,
        accountCount: existingCount + 1, // include this new one
      });
    } catch (emailErr) {
      console.error('[Signup] Failed to send ban email', emailErr);
    }

    return NextResponse.json(
      { 
        error: 'Your IP address has been flagged for trial abuse. To continue using the service, please purchase a subscription at https://bittorrented.com/pricing',
      },
      { status: 403 }
    );
  }

  if (existingCount > 0) {
    console.warn('[Signup] Duplicate trial attempt from same IP', {
      signupIp,
      existingCount,
      newUserId: data.user.id,
    });
  }

  const trialDays = existingCount > 0 ? 1 : 3;

  // Record the trial this route computed.
  //
  // The database trigger on_auth_user_created_subscription (create_trial_subscription)
  // has ALREADY inserted a plain 3-day trial row for this user by the time signUp
  // returns, because it covers OAuth and magic-link signups that never reach this
  // route. So the row always exists here, and this upsert must WIN the conflict:
  // merge our columns (signup_ip, trial window) over the trigger's row. With
  // ignoreDuplicates the row was silently left alone, signup_ip stayed NULL on
  // every user and the 1-day repeat-IP trial never applied. Columns not listed
  // below (id, created_at, renewal flags, subscription_*) are kept as-is.
  const trialStartedAt = new Date();
  const trialExpiresAt = new Date(trialStartedAt);
  trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

  const { error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        user_id: data.user.id,
        tier: 'trial',
        status: 'active',
        trial_started_at: trialStartedAt.toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
        signup_ip: signupIp,
      },
      {
        onConflict: 'user_id',
        ignoreDuplicates: false, // UPDATE the trigger's row rather than skipping it
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
