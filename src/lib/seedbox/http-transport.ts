/**
 * HTTP transport — hand a magnet to a seedbox torrent-client API (e.g. torlink).
 */

import type { SeedboxHttpConfig } from './config';
import { describeFetchError } from './fetch-error';

export interface SendResult {
  ok: boolean;
  transport: 'http' | 'ssh';
  message: string;
}

/** Build the auth headers for a request based on the configured auth style. */
export function buildAuthHeaders(config: SeedboxHttpConfig): Record<string, string> {
  if (config.auth.kind === 'header') {
    return { [config.auth.header]: config.token };
  }
  return { Authorization: `Bearer ${config.token}` };
}

export async function sendMagnetViaHttp(
  config: SeedboxHttpConfig,
  magnet: string,
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const url = `${config.baseUrl}${config.addPath.startsWith('/') ? '' : '/'}${config.addPath}`;
  const body: Record<string, string> = { [config.magnetField]: magnet };
  if (name) body.name = name;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...buildAuthHeaders(config),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Report the underlying cause (ECONNREFUSED / ENOTFOUND / …), not undici's
    // opaque "fetch failed" — they call for completely different fixes.
    return {
      ok: false,
      transport: 'http',
      message: `Could not reach seedbox: ${describeFetchError(error)}`,
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text.trim().slice(0, 200);
    return {
      ok: false,
      transport: 'http',
      message: `Seedbox API returned ${response.status}${detail ? ` — ${detail}` : ''}`,
    };
  }

  // torlink answers 200 {"ok":true,"outcome":"added"|"duplicate"} — a 200 alone
  // does not mean this call queued anything, so report which one happened.
  const outcome = await response
    .json()
    .then((body: unknown) =>
      body && typeof body === 'object' && typeof (body as { outcome?: unknown }).outcome === 'string'
        ? (body as { outcome: string }).outcome
        : null
    )
    .catch(() => null);

  return {
    ok: true,
    transport: 'http',
    message:
      outcome === 'duplicate'
        ? 'Already on the seedbox — torlink is tracking it'
        : 'Sent to seedbox via HTTP API',
  };
}
