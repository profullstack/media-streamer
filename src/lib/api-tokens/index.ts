/**
 * API Tokens — long-lived bearer tokens for the TronBrowser "Connect" flow.
 *
 * Minted via the hosted /connect consent page; presented by TronBrowser (and
 * future standalone extensions) as `Authorization: Bearer btr_...` to the
 * token-auth /api/v1/* endpoints. Only the SHA-256 hash is stored.
 *
 * Server-side only — uses the service-role Supabase client (bypasses RLS).
 */

import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';

// api_tokens is a new table not yet in the generated Database types, so use the
// untyped client for these queries.
function sb(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

const PREFIX = 'btr_';

/**
 * Only allow the connect flow to redirect back to TronBrowser surfaces:
 * tronbrowser.dev, and the extension's chrome.identity callback
 * (https://<ext-id>.chromiumapp.org/...). Prevents token exfiltration.
 */
export function isAllowedConnectRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    return h === 'tronbrowser.dev' || h.endsWith('.tronbrowser.dev') || h.endsWith('.chromiumapp.org');
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a new API token for a user. Returns the PLAINTEXT token (shown once).
 */
export async function createApiToken(userId: string, name = 'TronBrowser'): Promise<string> {
  const token = PREFIX + randomBytes(32).toString('hex');
  const supabase = sb();
  const { error } = await supabase.from('api_tokens').insert({
    user_id: userId,
    token_hash: hashToken(token),
    name,
  });
  if (error) throw new Error('failed to mint api token: ' + error.message);
  return token;
}

/**
 * Verify a bearer token. Returns the owning user id, or null. Touches
 * last_used_at on success.
 */
export async function verifyApiToken(token: string): Promise<{ userId: string } | null> {
  if (!token || !token.startsWith(PREFIX)) return null;
  const supabase = sb();
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;
  // Best-effort touch (don't block on it).
  void supabase.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { userId: data.user_id as string };
}

/**
 * Resolve the API user from a request's Authorization header.
 * Returns { id, email } or null.
 */
export async function getApiUser(request: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const result = await verifyApiToken(m[1].trim());
  if (!result) return null;
  // Look up the email via the service-role admin API (best-effort).
  let email: string | null = null;
  try {
    const supabase = sb();
    const { data } = await supabase.auth.admin.getUserById(result.userId);
    email = data?.user?.email ?? null;
  } catch {
    /* ignore */
  }
  return { id: result.userId, email };
}
