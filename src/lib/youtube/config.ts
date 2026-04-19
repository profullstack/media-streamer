/**
 * YouTube / Google OAuth configuration.
 *
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_OAUTH_REDIRECT_URI  (e.g. https://your-host/api/youtube/auth/callback)
 */

export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

const YOUTUBE_SEARCH_SCOPES = new Set<string>([
  YOUTUBE_READONLY_SCOPE,
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtubepartner',
  'https://www.googleapis.com/auth/youtubepartner-channel-audit',
]);

export const YOUTUBE_SCOPES = [
  'openid',
  'email',
  'profile',
  YOUTUBE_READONLY_SCOPE,
] as const;

export function hasYouTubeSearchScope(scopes: readonly string[]): boolean {
  return scopes.some((scope) => YOUTUBE_SEARCH_SCOPES.has(scope));
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Google OAuth env vars. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.'
    );
  }

  return { clientId, clientSecret, redirectUri };
}
