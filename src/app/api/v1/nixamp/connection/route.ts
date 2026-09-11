/**
 * GET    /api/v1/nixamp/connection  — is a nixamp account connected, and whose
 * DELETE /api/v1/nixamp/connection  — disconnect it, here and on nixamp
 *
 * What the settings page reads and what its Disconnect button calls. The
 * answer never carries a token: the page needs to know that a connection
 * exists and what to call the person, and nothing else.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { disconnectNixampAccount, getNixampAccount, isNixampConfigured } from '@/lib/nixamp';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getNixampAccount(user.id);
  return NextResponse.json({
    configured: isNixampConfigured(),
    connected: Boolean(account),
    ...(account
      ? {
          connection: {
            // The public name on nixamp. Falling back to the id rather than
            // the address, which is a credential over there.
            handle: account.handle || account.nixampSub,
            site: account.nixampSite,
            scopes: account.scopes,
          },
        }
      : {}),
  });
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gone = await disconnectNixampAccount(user.id);
  return NextResponse.json({ success: true, disconnected: gone });
}
