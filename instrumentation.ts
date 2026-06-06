/**
 * Next.js instrumentation hook — runs once when the server starts.
 */

export async function register(): Promise<void> {
  // Intentionally empty. SiriusXM sessions refresh on demand in the radio API.
}
