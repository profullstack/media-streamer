import { getCurrentUser } from '@/lib/auth';
import { getPasses, speechErrorResponse } from '@/lib/translate';

// Translated audio passes (src/lib/translate/passes.ts): free sessions left
// today, audio credit, plans and the coins checkout accepts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  try {
    return Response.json(await getPasses().access(user?.id), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return speechErrorResponse(error);
  }
}
