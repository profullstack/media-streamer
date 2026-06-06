import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount, sendEmail } from '@/lib/email-accounts';
import { getInboxMessage, toMailboxAccount } from '@/lib/email-reader';
import { isPaidSubscriptionActive } from '@/lib/subscription/check';

interface RouteParams {
  params: Promise<{ uid: string }>;
}

interface ReplyRequest {
  accountId: string;
  body: string;
}

function isReplyRequest(body: unknown): body is ReplyRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.accountId === 'string' && typeof obj.body === 'string';
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || '(no subject)'}`;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const paid = await isPaidSubscriptionActive(user.id);
  if (!paid.active) {
    return NextResponse.json({
      error: 'Paid subscription required',
      message: 'Replying to email requires an active paid subscription.',
    }, { status: 403 });
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

  if (!isReplyRequest(body) || !body.body.trim()) {
    return NextResponse.json({ error: 'Missing reply body' }, { status: 400 });
  }

  try {
    const account = await getEmailAccount(user.id, body.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    if (!toMailboxAccount(account).imap) {
      return NextResponse.json({ error: 'This email account does not support inbox reading yet' }, { status: 400 });
    }

    const original = await getInboxMessage(account, uid, { markSeen: false });
    if (!original) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const references = original.messageId
      ? [...original.references, original.messageId]
      : original.references;

    const result = await sendEmail(account, {
      to: original.replyTo.length ? original.replyTo : [original.from],
      subject: replySubject(original.subject),
      text: body.body,
      inReplyTo: original.messageId,
      references,
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('[EmailReply] Failed to send reply:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to send reply',
    }, { status: 500 });
  }
}
