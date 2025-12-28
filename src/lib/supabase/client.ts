import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Server-side Supabase client using service role key
 * CRITICAL: This must ONLY be used in server-side code (API routes, server components)
 * NEVER import this in client components
 */

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error(
      'Missing SUPABASE_URL environment variable. ' +
      'Set it to your Supabase project URL (e.g., https://your-project.supabase.co)'
    );
  }
  // Validate URL format
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    console.warn(
      `SUPABASE_URL may be invalid: "${url}". ` +
      'Expected format: https://your-project.supabase.co'
    );
  }
  return url;
}

function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
      'Get this from your Supabase dashboard: Settings > API > Secret key (sb_secret_...)'
    );
  }
  // Supabase keys can be:
  // - New format: sb_secret_... (secret/service role key)
  // - Legacy format: eyJ... (JWT token)
  const validPrefixes = ['sb_secret_', 'eyJ'];
  const isValidFormat = validPrefixes.some(prefix => key.startsWith(prefix));
  
  if (!isValidFormat) {
    console.warn(
      `SUPABASE_SERVICE_ROLE_KEY format not recognized (starts with "${key.substring(0, 10)}..."). ` +
      'Expected format: sb_secret_... or eyJ... ' +
      'Get the correct key from: Supabase Dashboard > Settings > API > Secret key'
    );
  }
  return key;
}

/**
 * Create a Supabase client with service role privileges
 * This client bypasses RLS and should only be used server-side
 *
 * Configured with:
 * - Global fetch timeout of 30 seconds
 * - Connection keep-alive disabled to prevent stale connections
 */
/**
 * Convert Headers object or plain object to a plain object
 * This ensures we don't lose headers when spreading
 * Exported for testing
 */
export function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  
  if (Array.isArray(headers)) {
    const result: Record<string, string> = {};
    for (const [key, value] of headers) {
      result[key] = value;
    }
    return result;
  }
  
  return headers as Record<string, string>;
}

export function createServerClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Add fetch options for better reliability
      fetch: (url, options = {}) => {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        // Properly normalize headers to preserve apikey and other headers
        const normalizedHeaders = normalizeHeaders(options.headers);
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
          // Disable keep-alive to prevent stale connections on serverless
          headers: {
            ...normalizedHeaders,
            'Connection': 'close',
          },
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
    },
  });
}

/**
 * Singleton instance for server-side operations
 * Use this for most server-side database operations
 *
 * Note: On serverless platforms, the singleton may be recreated
 * on each cold start, which is expected behavior.
 */
let serverClient: SupabaseClient<Database> | null = null;
let clientCreatedAt: number = 0;
const CLIENT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes - recreate client periodically

export function getServerClient(): SupabaseClient<Database> {
  const now = Date.now();
  
  // Recreate client if it's too old (prevents stale connections)
  if (serverClient && (now - clientCreatedAt) > CLIENT_MAX_AGE_MS) {
    serverClient = null;
  }
  
  if (!serverClient) {
    serverClient = createServerClient();
    clientCreatedAt = now;
  }
  return serverClient;
}

/**
 * Force recreation of the Supabase client
 * Call this if you encounter connection errors
 */
export function resetServerClient(): void {
  serverClient = null;
  clientCreatedAt = 0;
}

// Export the client type for use in other modules
export type ServerClient = SupabaseClient<Database>;
