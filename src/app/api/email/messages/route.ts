import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailAccount, listPublicEmailAccounts, type PublicEmailAccount } from '@/lib/email-accounts';
import { hasSupportedImapProvider, listInboxMessages, toMailboxAccount } from '@/lib/email-reader';
import { buildEmailAccountLoadError, buildInboxLoadError } from '@/lib/email-reader/errors';

function parseLimit(value: string | null): number {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

function toAccountOption(account: PublicEmailAccount) {
  return {
    id: account.id,
    label: account.label,
    fromEmail: account.fromEmail,
    isDefault: account.isDefault,
    readable: hasSupportedImapProvider(account),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  let accounts: PublicEmailAccount[];
  try {
    accounts = await listPublicEmailAccounts(user.id);
  } catch (error) {
    console.error('[EmailMessages] Failed to load email accounts:', error);
    return NextResponse.json(buildEmailAccountLoadError(error), { status: 500 });
  }

  const accountOptions = accounts.map(toAccountOption);

  // No accountId = just return the account list, no inbox fetch.
  if (!accountId) {
    return NextResponse.json({ accounts: accountOptions, messages: [] });
  }

  try {
    const selected = accountOptions.find((account) => account.id === accountId);

    if (!selected) {
      return NextResponse.json({
        accounts: accountOptions,
        messages: [],
        error: 'Email account not found',
      }, { status: 404 });
    }

    if (!selected.readable) {
      return NextResponse.json({
        selectedAccountId: selected.id,
        accounts: accountOptions,
        messages: [],
        error: 'This email account does not support inbox reading yet',
        solution: 'Use a provider with a supported IMAP preset, such as Gmail or Forward Email, or add an IMAP preset for this provider.',
      }, { status: 400 });
    }

    let selectedAccount;
    try {
      selectedAccount = await getEmailAccount(user.id, selected.id);
    } catch (error) {
      console.error('[EmailMessages] Failed to load selected email account:', error);
      return NextResponse.json({
        ...buildEmailAccountLoadError(error),
        selectedAccountId: selected.id,
        accounts: accountOptions,
        messages: [],
      }, { status: 500 });
    }

    if (!selectedAccount) {
      return NextResponse.json({
        selectedAccountId: selected.id,
        accounts: accountOptions,
        messages: [],
        error: 'Email account not found',
      }, { status: 404 });
    }

    const selectedMailbox = toMailboxAccount(selectedAccount);
    if (!selectedMailbox.imap) {
      return NextResponse.json({
        selectedAccountId: selected.id,
        accounts: accountOptions,
        messages: [],
        error: 'This email account does not support inbox reading yet',
        solution: 'Use a provider with a supported IMAP preset, such as Gmail or Forward Email, or add an IMAP preset for this provider.',
      }, { status: 400 });
    }

    let messages;
    try {
      messages = await listInboxMessages(selectedAccount, { limit });
    } catch (error) {
      console.error('[EmailMessages] Failed to list inbox messages:', error);
      return NextResponse.json({
        ...buildInboxLoadError(error, selectedAccount),
        selectedAccountId: selected.id,
        accounts: accountOptions,
        messages: [],
      }, { status: 502 });
    }

    return NextResponse.json({
      selectedAccountId: selected.id,
      accounts: accountOptions,
      messages,
    });
  } catch (error) {
    console.error('[EmailMessages] Failed to list inbox messages:', error);
    return NextResponse.json(buildInboxLoadError(error, null), { status: 500 });
  }
}
