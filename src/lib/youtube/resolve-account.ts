/**
 * Shared account resolution for YouTube route handlers.
 *
 * Route files may only export handlers, so this lives in lib. It mirrors the
 * explicit-id -> default -> first -> 412 behaviour the existing YouTube routes
 * already implement inline.
 */

import { NextResponse } from 'next/server';
import { getAccountById, listAccountsForUser } from './repository';
import type { YouTubeAccount } from './types';

export function isResponse(value: YouTubeAccount | Response): value is Response {
  return value instanceof Response;
}

export async function resolveYouTubeAccount(
  userId: string,
  accountId: string | null
): Promise<YouTubeAccount | Response> {
  if (accountId) {
    const account = await getAccountById(userId, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    return account;
  }

  const accounts = await listAccountsForUser(userId);
  const account = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
  if (!account) {
    return NextResponse.json(
      { error: 'no_connected_account', message: 'Connect a YouTube account first.' },
      { status: 412 }
    );
  }
  return account;
}
