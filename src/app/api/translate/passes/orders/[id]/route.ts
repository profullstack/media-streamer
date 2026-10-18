import { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getPasses, speechErrorResponse } from '@/lib/translate';

// A pass purchase's status. Asking CoinPay here is what credits a paid order,
// so a buyer returning from checkout is never waiting on the webhook.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ error: 'Sign in to check your purchase.' }, { status: 401 });
  const { id } = await params;
  try {
    return Response.json(await getPasses().check(user.id, id));
  } catch (error) {
    return speechErrorResponse(error);
  }
}
