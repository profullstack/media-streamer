/**
 * The per-user seal record (user_secret_vaults). It holds only ciphertext, the
 * KDF salt/params and a key-check value: nothing in it opens without the
 * user's passphrase or recovery key. Service-role access only (RLS, no policies).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSealRecord, type SealRecord } from '@profullstack/sealed-secrets';

import { createServerClient } from '@/lib/supabase';

const TABLE = 'user_secret_vaults';

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

export async function getVaultSeal(userId: string): Promise<SealRecord | null> {
  const { data, error } = await db().from(TABLE).select('seal').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Failed to load key vault: ${error.message}`);
  const seal = (data as { seal?: unknown } | null)?.seal;
  return isSealRecord(seal) ? seal : null;
}

/** First vault for a user. Refuses to overwrite an existing one. */
export async function createVaultSeal(userId: string, seal: SealRecord): Promise<boolean> {
  const { error } = await db().from(TABLE).insert({ user_id: userId, seal, seal_version: seal.v });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`Failed to create key vault: ${error.message}`);
  }
  return true;
}

/** Passphrase change: same data key, new wrapping. Caller verifies the key first. */
export async function replaceVaultSeal(userId: string, seal: SealRecord): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({ seal, seal_version: seal.v, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to update key vault: ${error.message}`);
}
