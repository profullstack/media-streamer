import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  checkSmtpAccount,
  getEmailAccount,
  toPublicEmailAccount,
  updateEmailAccountCheckStatus,
} from '@/lib/email-accounts';
import { buildEmailAccountLoadError, buildSmtpCheckError } from '@/lib/email-reader/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  let account;
  try {
    account = await getEmailAccount(user.id, id);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[EmailAccounts] Failed to load account for check:', error);
    return NextResponse.json(buildEmailAccountLoadError(error), { status: 500 });
  }

  const result = await checkSmtpAccount(account);
  const updated = await updateEmailAccountCheckStatus(user.id, id, result.success, result.error);
  const failure = result.success ? undefined : buildSmtpCheckError(result.error ?? 'SMTP check failed', account);

  return NextResponse.json({
    success: result.success,
    error: result.success ? undefined : failure?.error,
    details: failure?.details,
    solution: failure?.solution,
    docsUrl: failure?.docsUrl,
    account: toPublicEmailAccount(updated),
  }, { status: result.success ? 200 : 400 });
}
