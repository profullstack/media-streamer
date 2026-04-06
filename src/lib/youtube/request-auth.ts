/**
 * Extract the authenticated user id from a Next.js request using the existing
 * `sb-auth-token` cookie convention (matches podcasts / iptv routes).
 */

import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const AUTH_COOKIE_NAME = 'sb-auth-token';

interface SessionToken {
  access_token: string;
  refresh_token: string;
}

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

export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionToken = parseSessionCookie(cookieValue);
  if (!sessionToken) return null;

  const supabase = createServerClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: sessionToken.access_token,
    refresh_token: sessionToken.refresh_token,
  });
  if (sessionError) return null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;
  return user.id;
}
