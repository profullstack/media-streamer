import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount } from '@/lib/email-accounts';
import { archiveMessage, toMailboxAccount } from '@/lib/email-reader';
import { buildInboxLoadError } from '@/lib/email-reader/errors';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { uid: rawUid } = await params;
  const uid = Number(rawUid);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const accountId = (body as Record<string, unknown>)?.accountId;
  if (typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  try {
    const account = await getEmailAccount(user.id, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }
    if (!toMailboxAccount(account).imap) {
      return NextResponse.json({ error: 'This account does not support IMAP' }, { status: 400 });
    }

    await archiveMessage(account, uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[EmailArchive] Failed:', error);
    return NextResponse.json(buildInboxLoadError(error, null), { status: 502 });
  }
}
