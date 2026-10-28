import { isVaultLockedError } from '@/lib/vault/errors';
import { NextRequest, NextResponse } from 'next/server';
import { vaultErrorBody } from '@/lib/vault';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  createEmailAccount,
  listPublicEmailAccounts,
  toPublicEmailAccount,
  validateCreateEmailAccountInput,
} from '@/lib/email-accounts';
import { buildEmailAccountLoadError } from '@/lib/email-reader/errors';
import { withVaultErrors } from '@/lib/vault/route';

async function handleGET(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const accounts = await listPublicEmailAccounts(user.id);
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('[EmailAccounts] Failed to list accounts:', error);
    return NextResponse.json(buildEmailAccountLoadError(error), { status: isVaultLockedError(error) ? 423 : 500 });
  }
}

async function handlePOST(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = validateCreateEmailAccountInput(body);
  if (!input) {
    return NextResponse.json({ error: 'Invalid email account configuration' }, { status: 400 });
  }

  try {
    const account = await createEmailAccount(user.id, input);
    return NextResponse.json({ account: toPublicEmailAccount(account) });
  } catch (error) {
    const locked = vaultErrorBody(error);
    if (locked) return NextResponse.json(locked.body, { status: locked.status });
    console.error('[EmailAccounts] Failed to create account:', error);
    return NextResponse.json({
      error: 'Failed to create email account.',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export const GET = withVaultErrors(handleGET);
export const POST = withVaultErrors(handlePOST);
