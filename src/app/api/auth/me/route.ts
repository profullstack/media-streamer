/**
 * Auth Me API Route
 *
 * Returns current user's authentication state.
 * Server-side only - maintains Supabase security rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface UserProfile {
  subscription_tier?: string;
  display_name?: string;
  avatar_url?: string;
}

interface AuthUserResponse {
  id: string;
  email: string;
  subscription_tier: string;
  display_name?: string;
  avatar_url?: string;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = createServerClient();

  // Get current user from session
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { user: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  }

  // Get user profile with subscription info
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier, display_name, avatar_url')
    .eq('user_id', user.id)
    .single() as { data: UserProfile | null; error: unknown };

  const responseUser: AuthUserResponse = {
    id: user.id,
    email: user.email ?? '',
    subscription_tier: profile?.subscription_tier ?? 'free',
    ...(profile?.display_name && { display_name: profile.display_name }),
    ...(profile?.avatar_url && { avatar_url: profile.avatar_url }),
  };

  return NextResponse.json(
    { user: responseUser },
    {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    }
  );
}
