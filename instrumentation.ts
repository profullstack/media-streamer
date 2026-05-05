/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to register long-lived background jobs.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startSiriusXmRefreshScheduler } = await import(
    './src/lib/radio/siriusxm-refresh-scheduler'
  );
  startSiriusXmRefreshScheduler();
}
