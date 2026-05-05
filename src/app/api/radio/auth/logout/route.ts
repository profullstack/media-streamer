/**
 * POST /api/radio/auth/logout
 *
 * Clears the user's SiriusXM credentials and drops any cached bearer.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteCredentials } from '@/lib/radio/siriusxm-credentials';
import { invalidateSiriusXmSession, withSiriusXmUser } from '@/lib/radio/siriusxm-auth';

export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    await deleteCredentials(user.id);
    await withSiriusXmUser(user.id, async () => {
      invalidateSiriusXmSession();
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[radio/auth/logout]', error);
    return NextResponse.json(
      { error: 'Failed to disconnect SiriusXM' },
      { status: 500 }
    );
  }
}
