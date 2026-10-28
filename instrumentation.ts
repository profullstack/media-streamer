/**
 * Next.js instrumentation hook — runs once when the server starts.
 */

export async function register(): Promise<void> {
  // Only the Node.js server runtime has a process to guard (skip edge runtime).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installProcessGuards } = await import('@/lib/process-guards');
    installProcessGuards();

    // Customer webhooks: send queued deliveries every few seconds, retrying
    // failures with backoff (@profullstack/webhooks). Once per server process.
    // Bracket reads: read at runtime, never inlined at build time.
    const env = process.env;
    if (env['SUPABASE_SERVICE_ROLE_KEY'] && env['SUPABASE_URL']) {
      const { startWebhooks } = await import('@/lib/webhooks/hub');
      startWebhooks();
    }
  }
  // SiriusXM sessions refresh on demand in the radio API.
}
