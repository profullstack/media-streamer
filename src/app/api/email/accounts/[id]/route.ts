import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  deleteEmailAccount,
  getEmailAccount,
  toPublicEmailAccount,
  updateEmailAccount,
  validateUpdateEmailAccountInput,
} from '@/lib/email-accounts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const account = await getEmailAccount(user.id, id);
  if (!account) {
    return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  }

  return NextResponse.json({ account: toPublicEmailAccount(account) });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
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

  const input = validateUpdateEmailAccountInput(body);
  if (!input) {
    return NextResponse.json({ error: 'Invalid email account update' }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const account = await updateEmailAccount(user.id, id, input);
    return NextResponse.json({ account: toPublicEmailAccount(account) });
  } catch (error) {
    console.error('[EmailAccounts] Failed to update account:', error);
    return NextResponse.json({ error: 'Failed to update email account' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteEmailAccount(user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[EmailAccounts] Failed to delete account:', error);
    return NextResponse.json({ error: 'Failed to delete email account' }, { status: 500 });
  }
}
