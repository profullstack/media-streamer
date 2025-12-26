import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Server-side Supabase client using service role key
 * CRITICAL: This must ONLY be used in server-side code (API routes, server components)
 * NEVER import this in client components
 */

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  return url;
}

function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
  return key;
}

/**
 * Create a Supabase client with service role privileges
 * This client bypasses RLS and should only be used server-side
 */
export function createServerClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Singleton instance for server-side operations
 * Use this for most server-side database operations
 */
let serverClient: ReturnType<typeof createServerClient> | null = null;

export function getServerClient() {
  if (!serverClient) {
    serverClient = createServerClient();
  }
  return serverClient;
}

// Export the client type for use in other modules
export type ServerClient = ReturnType<typeof createServerClient>;
