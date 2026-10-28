/**
 * Route wrapper: a VaultLockedError escaping a handler becomes a 423 with a
 * clear "unlock to resume" message instead of an opaque 500.
 */

import { NextResponse } from 'next/server';

import { vaultErrorBody } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withVaultErrors<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      const locked = vaultErrorBody(error);
      if (locked) return NextResponse.json(locked.body, { status: locked.status });
      throw error;
    }
  }) as T;
}
