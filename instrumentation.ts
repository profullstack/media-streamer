/**
 * Next.js instrumentation hook — runs once when the server starts.
 */

export async function register(): Promise<void> {
  // Only the Node.js server runtime has a process to guard (skip edge runtime).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installProcessGuards } = await import('@/lib/process-guards');
    installProcessGuards();
  }
  // SiriusXM sessions refresh on demand in the radio API.
}
