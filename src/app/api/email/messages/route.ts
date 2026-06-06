import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { listEmailAccounts } from '@/lib/email-accounts';
import { listInboxMessages, toMailboxAccount } from '@/lib/email-reader';

function parseLimit(value: string | null): number {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const accounts = await listEmailAccounts(user.id);
    const mailboxAccounts = accounts.map(toMailboxAccount);
    const selected = accountId
      ? mailboxAccounts.find((item) => item.account.id === accountId)
      : mailboxAccounts.find((item) => item.account.isDefault && item.imap) ?? mailboxAccounts.find((item) => item.imap);

    if (!selected) {
      return NextResponse.json({
        accounts: mailboxAccounts.map(({ account, imap }) => ({
          id: account.id,
          label: account.label,
          fromEmail: account.fromEmail,
          isDefault: account.isDefault,
          readable: Boolean(imap),
        })),
        messages: [],
        error: accounts.length === 0 ? 'No email accounts configured' : 'No readable IMAP account configured',
      }, { status: accounts.length === 0 ? 404 : 400 });
    }

    if (!selected.imap) {
      return NextResponse.json({ error: 'This email account does not support inbox reading yet' }, { status: 400 });
    }

    const messages = await listInboxMessages(selected.account, { limit });
    return NextResponse.json({
      selectedAccountId: selected.account.id,
      accounts: mailboxAccounts.map(({ account, imap }) => ({
        id: account.id,
        label: account.label,
        fromEmail: account.fromEmail,
        isDefault: account.isDefault,
        readable: Boolean(imap),
      })),
      messages,
    });
  } catch (error) {
    console.error('[EmailMessages] Failed to list inbox messages:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to load inbox',
    }, { status: 500 });
  }
}
