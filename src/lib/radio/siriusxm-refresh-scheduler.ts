/**
 * Periodic SiriusXM session refresher.
 *
 * Every 2.5h, walks every stored session and replays its cookie jar against
 * /session/v1/sessions/refresh, persisting the rotated tokens. Tokens issued
 * by SiriusXM are ~3h-life, so refreshing every 2.5h leaves a 30min cushion.
 *
 * Started once from instrumentation.ts on Next.js server boot. Best-effort:
 * a failure on one user's refresh is logged and skipped; the on-demand path
 * (ensureSiriusXmBearer) will retry the next time that user hits the radio.
 *
 * Off by default. Enable with SIRIUSXM_REFRESH_SCHEDULER=on.
 */

import { listAllCredentials, saveCredentials } from './siriusxm-credentials';
import { refreshSessionWithCookies } from './siriusxm-auth';

const INTERVAL_MS = 2.5 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export function startSiriusXmRefreshScheduler(): void {
  if (timer) return;
  if (process.env.SIRIUSXM_REFRESH_SCHEDULER !== 'on') return;

  timer = setInterval(refreshAllSessions, INTERVAL_MS);
  // Don't pin the event loop on a deploy/restart.
  timer.unref?.();

  console.log('[siriusxm-refresh] scheduled, interval=2.5h');
}

export function stopSiriusXmRefreshScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export async function refreshAllSessions(): Promise<void> {
  let creds;
  try {
    creds = await listAllCredentials();
  } catch (err) {
    console.error('[siriusxm-refresh] list failed:', (err as Error).message);
    return;
  }

  if (!creds.length) return;

  let ok = 0;
  let failed = 0;
  for (const c of creds) {
    try {
      const result = await refreshSessionWithCookies(c.sessionCookies);
      await saveCredentials({
        userId: c.userId,
        email: c.email,
        accessToken: result.accessToken,
        sessionCookies: result.cookies,
        accessTokenExpiresAt: result.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt ?? null,
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[siriusxm-refresh] user=${c.userId} failed: ${(err as Error).message}`
      );
    }
  }

  console.log(`[siriusxm-refresh] tick complete: ok=${ok} failed=${failed}`);
}
