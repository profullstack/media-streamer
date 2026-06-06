import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  checkSmtpAccount,
  getEmailAccount,
  toPublicEmailAccount,
  updateEmailAccountCheckStatus,
} from '@/lib/email-accounts';
import { checkImapAccount, hasSupportedImapProvider } from '@/lib/email-reader';
import { buildEmailAccountLoadError, buildInboxLoadError, buildSmtpCheckError } from '@/lib/email-reader/errors';

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

  const smtpResult = await checkSmtpAccount(account);
  let success = smtpResult.success;
  let errorMessage = smtpResult.error;
  let failure = success ? undefined : buildSmtpCheckError(errorMessage ?? 'SMTP check failed', account);

  if (success && hasSupportedImapProvider(account)) {
    try {
      await checkImapAccount(account);
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : 'IMAP check failed';
      failure = buildInboxLoadError(error, account);
    }
  }

  const updated = await updateEmailAccountCheckStatus(user.id, id, success, errorMessage);

  return NextResponse.json({
    success,
    error: success ? undefined : failure?.error,
    details: failure?.details,
    solution: failure?.solution,
    docsUrl: failure?.docsUrl,
    account: toPublicEmailAccount(updated),
  }, { status: success ? 200 : 400 });
}
