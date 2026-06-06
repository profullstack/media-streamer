import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  createEmailAccount,
  listEmailAccounts,
  toPublicEmailAccount,
  validateCreateEmailAccountInput,
} from '@/lib/email-accounts';

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const accounts = await listEmailAccounts(user.id);
    return NextResponse.json({ accounts: accounts.map(toPublicEmailAccount) });
  } catch (error) {
    console.error('[EmailAccounts] Failed to list accounts:', error);
    return NextResponse.json({ error: 'Failed to list email accounts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
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
    console.error('[EmailAccounts] Failed to create account:', error);
    return NextResponse.json({ error: 'Failed to create email account' }, { status: 500 });
  }
}
