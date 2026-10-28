/**
 * POST /api/vault/unlock { dek, ttl? }
 *
 * The browser derives the data key from the passphrase (or recovery key) and
 * sends the KEY, never the passphrase. We check it against the stored key-check
 * value and keep it in process memory for `ttl` (default 8h, max 7d). A restart
 * drops it. While unlocked, any secrets still under the old server key are
 * re-sealed under the vault (one-shot migration).
 */

import { NextRequest, NextResponse } from 'next/server';
import { base64ToBytes, wipe } from '@profullstack/sealed-secrets';

import { getCurrentUser } from '@/lib/auth';
import { getVaultSeal, migrateLegacySecrets, sealer, ttlSeconds, unlockStore } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { dek?: unknown; ttl?: unknown };
  if (typeof body.dek !== 'string') return NextResponse.json({ error: 'dek is required' }, { status: 400 });

  const seal = await getVaultSeal(user.id);
  if (!seal) return NextResponse.json({ error: 'Set up your key vault first', code: 'vault_missing' }, { status: 404 });

  let ttl: number;
  try {
    ttl = ttlSeconds(body.ttl);
  } catch {
    return NextResponse.json({ error: 'ttl must look like 30m, 8h or 7d (max 7d)' }, { status: 400 });
  }

  const dek = base64ToBytes(body.dek);
  try {
    if (dek.length !== 32 || !(await sealer.verifyDataKey(dek, seal, user.id))) {
      return NextResponse.json({ error: 'That key does not open your vault' }, { status: 403 });
    }
    const status = unlockStore().unlock(user.id, dek, ttl);
    const migration = await migrateLegacySecrets(user.id, dek);
    return NextResponse.json({ ...status, migration }, { headers: { 'Cache-Control': 'no-store' } });
  } finally {
    wipe(dek); // the store keeps its own copy
  }
}
