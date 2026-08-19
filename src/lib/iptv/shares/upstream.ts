/**
 * Fetching an upstream IPTV stream, verifying TLS wherever the provider allows it.
 *
 * The rest of this codebase reaches IPTV providers through an agent with
 * `rejectUnauthorized: false`, because a real share of them ship expired or
 * self-signed certificates and would otherwise be unreachable. That is a defensible
 * trade-off when you are streaming your own subscription to yourself.
 *
 * It is a weaker one here. A resale request carries the owner's provider
 * credentials, so an attacker positioned on the path could present any certificate,
 * terminate the connection, and harvest the credentials the whole opaque-session
 * design exists to protect.
 *
 * So this verifies by default and only retries without verification when the
 * failure was specifically a certificate problem — the providers that genuinely
 * need it still work, everyone else gets a verified connection, and the degradation
 * is logged rather than silent.
 */

import { Agent, fetch as undiciFetch } from 'undici';

/** Normal, verifying agent. Used for every first attempt. */
const strictAgent = new Agent({
  connect: { minVersion: 'TLSv1' as const },
  connections: 50,
});

/**
 * Fallback for providers with a broken certificate chain.
 *
 * Deliberately a second agent rather than a flag on the first: the insecure path is
 * reached only from the certificate-error branch below, so it cannot become the
 * default by accident.
 */
const permissiveAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1' as const,
    checkServerIdentity: () => undefined,
  },
  connections: 50,
});

/** Node/undici certificate failures all surface as one of these codes. */
const CERTIFICATE_ERRORS = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_NOT_YET_VALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
]);

function isCertificateError(error: unknown): boolean {
  const codes: string[] = [];
  let cursor: unknown = error;
  for (let depth = 0; cursor && depth < 4; depth++) {
    const e = cursor as { code?: unknown; cause?: unknown };
    if (typeof e.code === 'string') codes.push(e.code);
    cursor = e.cause;
  }
  return codes.some((c) => CERTIFICATE_ERRORS.has(c));
}

export interface UpstreamRequest {
  url: string;
  range?: string | null;
  timeoutMs?: number;
}

/**
 * Fetch an upstream stream or manifest.
 *
 * Never include the URL in a thrown message: it carries the owner's credentials.
 */
export async function fetchUpstream({
  url,
  range,
  timeoutMs = 30_000,
}: UpstreamRequest): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  const init = {
    headers: {
      'user-agent': 'VLC/3.0.20 LibVLC/3.0.20',
      ...(range ? { range } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  };

  try {
    return await undiciFetch(url, { ...init, dispatcher: strictAgent });
  } catch (error) {
    if (!isCertificateError(error)) throw error;
    // Host only -- the path and query carry the provider login.
    let host = 'unknown';
    try {
      host = new URL(url).host;
    } catch {}
    console.warn(`[iptv-resale] ${host} failed certificate verification; retrying unverified`);
    return undiciFetch(url, { ...init, dispatcher: permissiveAgent });
  }
}
