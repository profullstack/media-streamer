const DEFAULT_OAUTH_BASE_URL = 'https://coinpayportal.com';

export interface CoinPayOAuthUserInfo {
  sub: string;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  did: string | null;
  wallets: unknown[];
}

function oauthBaseUrl(): string {
  return (process.env.COINPAYPORTAL_OAUTH_BASE_URL || DEFAULT_OAUTH_BASE_URL).replace(/\/$/, '');
}

export function extractBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseUserInfo(value: unknown): CoinPayOAuthUserInfo | null {
  if (!isRecord(value) || typeof value.sub !== 'string') return null;

  return {
    sub: value.sub,
    email: typeof value.email === 'string' ? value.email.trim().toLowerCase() : null,
    emailVerified: typeof value.email_verified === 'boolean' ? value.email_verified : null,
    name: typeof value.name === 'string' ? value.name : null,
    did: typeof value.did === 'string' ? value.did : null,
    wallets: Array.isArray(value.wallets) ? value.wallets : [],
  };
}

export async function getCoinPayOAuthUserInfo(accessToken: string): Promise<CoinPayOAuthUserInfo | null> {
  const response = await fetch(`${oauthBaseUrl()}/api/oauth/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  try {
    return parseUserInfo(await response.json());
  } catch {
    return null;
  }
}
