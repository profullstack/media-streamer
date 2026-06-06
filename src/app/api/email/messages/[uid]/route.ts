import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount, listEmailAccounts, type EmailAccount } from '@/lib/email-accounts';
import { getInboxMessage, toMailboxAccount } from '@/lib/email-reader';
import { buildInboxLoadError } from '@/lib/email-reader/errors';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { uid: rawUid } = await params;
  const uid = Number(rawUid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  let account: EmailAccount | null = null;

  try {
    account = accountId
      ? await getEmailAccount(user.id, accountId)
      : (await listEmailAccounts(user.id)).find((item) => item.isDefault) ?? null;

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    if (!toMailboxAccount(account).imap) {
      return NextResponse.json({ error: 'This email account does not support inbox reading yet' }, { status: 400 });
    }

    const message = await getInboxMessage(account, uid);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error('[EmailMessages] Failed to load message:', error);
    return NextResponse.json(buildInboxLoadError(error, account), { status: 500 });
  }
}
