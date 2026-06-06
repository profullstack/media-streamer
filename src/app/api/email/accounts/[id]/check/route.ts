import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  checkSmtpAccount,
  getEmailAccount,
  toPublicEmailAccount,
  updateEmailAccountCheckStatus,
} from '@/lib/email-accounts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const account = await getEmailAccount(user.id, id);
  if (!account) {
    return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  }

  const result = await checkSmtpAccount(account);
  const updated = await updateEmailAccountCheckStatus(user.id, id, result.success, result.error);

  return NextResponse.json({
    success: result.success,
    error: result.success ? undefined : result.error,
    account: toPublicEmailAccount(updated),
  }, { status: result.success ? 200 : 400 });
}
