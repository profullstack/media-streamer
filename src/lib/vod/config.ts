/**
 * VOD source-connection config: resolve a provider's stored (encrypted) source
 * connection into something the adapters can use, and build auth headers for
 * HTTP-based sources. Secrets are sealed under the provider owner's key vault:
 * while the owner is locked, resolving throws VaultLockedError (streams pause).
 */

import { FIELDS, openOptional } from '@/lib/vault';
import type { SourceAuthKind, SourceKind } from './types';

export type HttpAuth =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; user: string; pass: string }
  | { kind: 'header'; header: string; token: string };

export interface XtreamSource {
  kind: 'xtream';
  serverUrl: string;
  username: string;
  password: string;
}
export interface HttpSource {
  kind: 'm3u' | 'http_library' | 'manifest';
  url: string;
  auth: HttpAuth;
}
export type ResolvedSource = XtreamSource | HttpSource;

/** Auth headers for an HTTP-based source request. */
export function authHeaders(auth: HttpAuth): Record<string, string> {
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

/** The stored provider columns needed to resolve a source (secrets encrypted). */
export interface ProviderSourceRow {
  owner_account_id: string;
  source_kind: SourceKind;
  source_url: string | null;
  source_username: string | null;
  source_password_encrypted: string | null;
  source_auth: SourceAuthKind;
  source_token_encrypted: string | null;
  source_header_name: string | null;
}

async function buildHttpAuth(row: ProviderSourceRow): Promise<HttpAuth> {
  const token = await openOptional(row.owner_account_id, FIELDS.vodToken, row.source_token_encrypted);
  const pass = await openOptional(row.owner_account_id, FIELDS.vodPassword, row.source_password_encrypted);
  switch (row.source_auth) {
    case 'bearer':
      return token ? { kind: 'bearer', token } : { kind: 'none' };
    case 'header':
      return token && row.source_header_name
        ? { kind: 'header', header: row.source_header_name, token }
        : { kind: 'none' };
    case 'basic':
      return row.source_username && pass
        ? { kind: 'basic', user: row.source_username, pass }
        : { kind: 'none' };
    case 'none':
    default:
      return { kind: 'none' };
  }
}

/** Resolve a provider row into a usable source config (secrets decrypted). */
export async function resolveSource(row: ProviderSourceRow): Promise<ResolvedSource | null> {
  const url = row.source_url?.replace(/\/+$/, '') ?? '';
  if (!url) return null;

  if (row.source_kind === 'xtream') {
    const password = await openOptional(row.owner_account_id, FIELDS.vodPassword, row.source_password_encrypted);
    if (!row.source_username || !password) return null;
    return { kind: 'xtream', serverUrl: url, username: row.source_username, password };
  }
  return { kind: row.source_kind, url, auth: await buildHttpAuth(row) };
}
