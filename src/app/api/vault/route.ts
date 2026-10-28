/**
 * Key vault: the user's own seal for every secret they store with us.
 *
 * GET  -> { exists, seal, unlocked, expiresAt }  (seal is ciphertext only; the
 *         browser needs it to unlock with the passphrase)
 * POST { seal }        -> create the vault (made in the browser; the passphrase
 *                         and recovery key never reach us)
 * PUT  { seal, dek }   -> change passphrase: same data key, new wrapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { base64ToBytes, isSealRecord, wipe } from '@profullstack/sealed-secrets';

import { getCurrentUser } from '@/lib/auth';
import { createVaultSeal, getVaultSeal, replaceVaultSeal, sealer, unlockStore } from '@/lib/vault';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const seal = await getVaultSeal(user.id);
  const status = unlockStore().status(user.id);
  return NextResponse.json({ userId: user.id, exists: Boolean(seal), seal, ...status }, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { seal?: unknown };
  if (!isSealRecord(body.seal)) {
    return NextResponse.json({ error: 'A sealed vault record is required' }, { status: 400 });
  }
  const created = await createVaultSeal(user.id, body.seal);
  if (!created) return NextResponse.json({ error: 'You already have a key vault' }, { status: 409 });
  return NextResponse.json({ exists: true }, { status: 201, headers: NO_STORE });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { seal?: unknown; dek?: unknown };
  const current = await getVaultSeal(user.id);
  if (!current) return NextResponse.json({ error: 'No key vault yet' }, { status: 404 });
  if (!isSealRecord(body.seal) || typeof body.dek !== 'string') {
    return NextResponse.json({ error: 'seal and dek are required' }, { status: 400 });
  }
  const dek = base64ToBytes(body.dek);
  try {
    // Both the old and the new record must open with the same data key.
    const ok =
      dek.length === 32 &&
      (await sealer.verifyDataKey(dek, current, user.id)) &&
      (await sealer.verifyDataKey(dek, body.seal, user.id));
    if (!ok) return NextResponse.json({ error: 'That key does not open your vault' }, { status: 403 });
    await replaceVaultSeal(user.id, body.seal);
    return NextResponse.json({ exists: true }, { headers: NO_STORE });
  } finally {
    wipe(dek);
  }
}
