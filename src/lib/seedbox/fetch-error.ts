/**
 * Turn a failed `fetch` into a message that says what actually went wrong.
 *
 * Node's undici throws `TypeError: fetch failed` for every transport-level
 * failure — refused connection, dead DNS, unreachable host, TLS mismatch — and
 * hides the real reason in `error.cause.code`. Reporting `error.message` alone
 * collapses all of those to the two useless words "fetch failed", which is why
 * a down torlink daemon and a wrong seedbox hostname looked identical in the UI.
 *
 * `describeFetchError` walks the cause chain, pulls out the OS-level code, and
 * pairs it with the operator action that actually fixes that case.
 *
 * Note that an `AbortSignal` timeout is NOT "fetch failed" — it surfaces as
 * "This operation was aborted". That distinction matters: a refused connection
 * means nothing is listening, whereas a timeout means packets are being dropped
 * (a firewall). Keeping them apart is the whole point of this helper.
 */

/** Plain-English cause + remedy per OS/undici error code. */
const CODE_HINTS: Record<string, string> = {
  ECONNREFUSED: 'nothing is listening on that port — the torlink daemon is down or bound to a different port',
  ENOTFOUND: "the hostname doesn't resolve — check the seedbox host in Settings",
  EAI_AGAIN: 'DNS lookup failed — check the seedbox host in Settings',
  EHOSTUNREACH: 'the host is unreachable — wrong IP, or the box is powered off',
  ENETUNREACH: 'the network is unreachable from the app server',
  ETIMEDOUT: 'the connection timed out — a firewall is dropping packets on that port',
  UND_ERR_CONNECT_TIMEOUT: 'the connection timed out — a firewall is dropping packets on that port',
  ECONNRESET: 'the connection was reset — the daemon may have restarted mid-request',
  EPIPE: 'the connection closed unexpectedly',
  EPROTO: 'protocol mismatch — is the URL http:// where the daemon speaks https:// (or vice versa)?',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'the seedbox uses a self-signed TLS certificate',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'the seedbox TLS certificate could not be verified',
  CERT_HAS_EXPIRED: 'the seedbox TLS certificate has expired',
};

/**
 * Deepest `code` in an error's cause chain. undici nests the real socket error
 * one or two levels down, and multi-address (A + AAAA) failures arrive as an
 * `AggregateError` whose `.errors` hold the per-address codes.
 */
export function rootCauseCode(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let code: string | null = null;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === 'string' && candidate.length > 0) code = candidate;

    // AggregateError (happy-eyeballs): take the first member that carries a code.
    const members = (current as { errors?: unknown }).errors;
    if (Array.isArray(members)) {
      for (const member of members) {
        const nested = rootCauseCodeShallow(member, seen);
        if (nested) return nested;
      }
    }

    current = (current as { cause?: unknown }).cause;
  }
  return code;
}

/** Cause-chain walk for AggregateError members, sharing the cycle guard. */
function rootCauseCodeShallow(error: unknown, seen: Set<unknown>): string | null {
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** True when the failure is an `AbortSignal` firing rather than a transport error. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort/i.test(message);
}

/**
 * A human-readable, actionable description of a failed `fetch`.
 *
 * @param error   The thrown value.
 * @param timeoutHint Message to use when the failure was an abort (a timeout).
 */
export function describeFetchError(
  error: unknown,
  timeoutHint = 'timed out (port blocked by a firewall, or the daemon is not responding)'
): string {
  if (isAbortError(error)) return timeoutHint;

  const message = error instanceof Error ? error.message : String(error);
  const code = rootCauseCode(error);
  if (!code) return message;

  const hint = CODE_HINTS[code];
  // "fetch failed" carries no information; lead with the code instead of it.
  const base = message === 'fetch failed' ? code : `${message} (${code})`;
  return hint ? `${base} — ${hint}` : base;
}
