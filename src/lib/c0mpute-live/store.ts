/**
 * Supabase (service role) behind the c0mpute Live stores. Tables from
 * 20261125120000_c0mpute_live.sql; neither is in the generated Database types.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import type { LiveStreamStore, StoredStream } from './connect';
import { visibilityOf, type ClientCache } from './oauth';

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

const fail = (what: string, error: { message: string } | null): void => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

export function supabaseClientCache(client: () => SupabaseClient = db): ClientCache {
  return {
    async getClient(redirectUri) {
      const { data, error } = await client()
        .from('c0mpute_oauth_client')
        .select('client_id, redirect_uri')
        .eq('id', true)
        .maybeSingle();
      fail('c0mpute_oauth_client read', error);
      const row = data as { client_id?: string; redirect_uri?: string } | null;
      return row?.client_id && row.redirect_uri === redirectUri ? row.client_id : null;
    },
    async saveClient(redirectUri, clientId) {
      const { error } = await client()
        .from('c0mpute_oauth_client')
        .upsert({ id: true, client_id: clientId, redirect_uri: redirectUri }, { onConflict: 'id' });
      fail('c0mpute_oauth_client save', error);
    },
    async clearClient() {
      const { error } = await client().from('c0mpute_oauth_client').delete().eq('id', true);
      fail('c0mpute_oauth_client clear', error);
    },
  };
}

export function supabaseLiveStreamStore(client: () => SupabaseClient = db): LiveStreamStore {
  return {
    async get(userId) {
      const { data, error } = await client()
        .from('c0mpute_live_streams')
        .select('user_id, stream_id, watch_url, playback_url, account_label, visibility, stream_key_enc')
        .eq('user_id', userId)
        .maybeSingle();
      fail('c0mpute_live_streams read', error);
      if (!data) return null;
      const row = data as StoredStream;
      return { ...row, visibility: visibilityOf(row.visibility) };
    },
    async save(row) {
      const { error } = await client()
        .from('c0mpute_live_streams')
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      fail('c0mpute_live_streams save', error);
    },
    async remove(userId) {
      const { error } = await client().from('c0mpute_live_streams').delete().eq('user_id', userId);
      fail('c0mpute_live_streams delete', error);
    },
  };
}
