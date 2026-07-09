/**
 * Seedbox file streaming — build a URL to a completed file on the seedbox and
 * proxy it back to the browser.
 *
 * Convention: standard torrent clients save a torrent's files at their natural
 * relative paths under a save directory. If that directory is served over HTTP
 * at `SEEDBOX_FILES_BASE_URL`, then a file the app already knows (by its
 * torrent-relative `path`) streams from `base + '/' + path`. No torlink API is
 * required for discovery — the app learned the paths when it indexed the magnet.
 */

import type { SeedboxFilesConfig } from './config';

/** Auth headers for a request to the seedbox file server. */
export function filesAuthHeaders(config: SeedboxFilesConfig): Record<string, string> {
  const auth = config.auth;
  switch (auth.kind) {
    case 'bearer':
      return { Authorization: `Bearer ${auth.token}` };
    case 'header':
      return { [auth.header]: auth.token };
    case 'basic':
      return { Authorization: `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}` };
    case 'none':
    default:
      return {};
  }
}

/**
 * Build the absolute seedbox URL for a torrent-relative file path. Returns null
 * for paths that try to escape the base (traversal / absolute / scheme).
 */
export function buildSeedboxFileUrl(baseUrl: string, filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  // Reject absolute paths, schemes, backslashes, and traversal.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // has a URL scheme
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
  if (trimmed.includes('\\')) return null;

  const segments = trimmed.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '..' || s === '.')) return null;

  const encoded = segments.map((s) => encodeURIComponent(s)).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encoded}`;
}

export interface SeedboxFetchOptions {
  range?: string | null;
  method?: 'GET' | 'HEAD';
  signal?: AbortSignal;
}

/**
 * Fetch a file from the seedbox with the configured auth, forwarding a Range
 * header when present. Returns the upstream Response (its body is a stream the
 * caller pipes through — never buffered whole).
 */
export async function fetchSeedboxFile(
  config: SeedboxFilesConfig,
  filePath: string,
  options: SeedboxFetchOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const url = buildSeedboxFileUrl(config.baseUrl, filePath);
  if (!url) {
    throw new Error('Invalid seedbox file path');
  }
  const headers: Record<string, string> = { ...filesAuthHeaders(config) };
  if (options.range) headers.Range = options.range;

  return fetchImpl(url, {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal,
    redirect: 'follow',
  });
}
