/**
 * Broadcast with Nixamp: hand a person's chosen audio to their own Nixamp
 * server, which copies it and makes a private station draft from it.
 *
 * Three rules hold the whole thing together:
 *
 * - The person's nixamp token goes only to a server nixamp.com says is
 *   theirs (`GET /api/v1/servers`). A host named in a request is never
 *   trusted on its own: that would hand their token to anybody who could
 *   type a URL.
 * - Each file travels by a grant that opens that one file, for a few hours,
 *   and nothing else -- not the cast token, which opens everything a member
 *   can stream. A grant is an HMAC with its own label, so it cannot be
 *   mistaken for any other signature made from the same secret.
 * - The same person handing the same files to the same server is the same
 *   handoff: the idempotency key is derived from exactly those, so a double
 *   click or a retry never makes a second station.
 *
 * Contract: nixamp docs/handoff.md (version 1).
 */

import { createHash } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/client';
import { getAppOrigin } from './config';
import { usableAccessToken, type NixampAccount } from './accounts';

export const GRANT_TTL_SECONDS = 6 * 60 * 60;
export const MAX_HANDOFF_FILES = 500;
const GRANT_LABEL = 'bittorrented-nixamp-file-grant-v1';

export class HandoffError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

const encoder = new TextEncoder();

function grantSecret(): string | null {
  const explicit = process.env.NIXAMP_HANDOFF_SECRET?.trim();
  if (explicit) return `${GRANT_LABEL}:${explicit}`;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return base ? `${GRANT_LABEL}:${base}` : null;
}

async function key(): Promise<CryptoKey> {
  const secret = grantSecret();
  if (!secret) throw new HandoffError('not_configured', 'file grants need NIXAMP_HANDOFF_SECRET or SUPABASE_SERVICE_ROLE_KEY', 500);
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export interface GrantClaims {
  userId: string;
  torrentId: string;
  fileId: string;
  /** The Nixamp server this was minted for. */
  audience: string;
  /** Unix seconds. */
  expiresAt: number;
}

export async function createFileGrant(claims: GrantClaims): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify([claims.userId, claims.torrentId, claims.fileId, claims.audience, claims.expiresAt])));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), encoder.encode(payload)));
  return `${payload}.${b64url(signature)}`;
}

/** The claims of a grant that is genuine and unexpired; null for anything else. */
export async function verifyFileGrant(grant: string, now = Date.now()): Promise<GrantClaims | null> {
  const [payload, signature, extra] = grant.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(), Buffer.from(signature, 'base64url'), encoder.encode(payload));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const [userId, torrentId, fileId, audience, expiresAt] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as [string, string, string, string, number];
    if (typeof expiresAt !== 'number' || expiresAt * 1000 <= now) return null;
    return { userId, torrentId, fileId, audience, expiresAt };
  } catch {
    return null;
  }
}

export interface NixampHost {
  id: string;
  name: string;
  url: string;
}

function needsStations(account: NixampAccount): void {
  if (!account.scopes.includes('stations')) {
    throw new HandoffError(
      'reconnect_required',
      'Your nixamp connection was made before stations existed. Reconnect nixamp in Settings to send music to your server.',
      409,
    );
  }
}

/** The person's own Nixamp servers, as nixamp.com lists them. */
export async function listHosts(account: NixampAccount, fetcher: typeof fetch = fetch): Promise<NixampHost[]> {
  needsStations(account);
  const { accessToken, config } = await usableAccessToken(account, fetcher);
  const response = await fetcher(`${config.site}/api/v1/servers`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new HandoffError('nixamp_refused', `nixamp.com would not list your servers (HTTP ${response.status})`, 502);
  const body = (await response.json()) as { servers?: Array<{ id?: string; name?: string; url?: string }> };
  return (body.servers ?? [])
    .filter((one) => typeof one.url === 'string' && /^https:\/\//i.test(one.url))
    .map((one) => ({ id: String(one.id ?? ''), name: String(one.name ?? one.url), url: String(one.url).replace(/\/+$/, '') }));
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** One of the person's own servers, or a refusal: the token goes nowhere else. */
async function ownHost(account: NixampAccount, host: string, fetcher: typeof fetch): Promise<NixampHost> {
  const wanted = originOf(host);
  const hosts = await listHosts(account, fetcher);
  const match = hosts.find((one) => originOf(one.url) === wanted);
  if (!wanted || !match) throw new HandoffError('unknown_host', 'that is not one of your Nixamp servers', 400);
  return match;
}

export interface HandoffRequest {
  host: string;
  torrentId: string;
  fileIds: string[];
  name?: string;
}

const AUDIO = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav)$/i;

/** Hand the chosen audio files to the person's Nixamp server. */
export async function startHandoff(
  userId: string,
  account: NixampAccount,
  request: HandoffRequest,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  needsStations(account);
  const fileIds = [...new Set((request.fileIds ?? []).filter((one) => typeof one === 'string' && one.length > 0))];
  if (fileIds.length === 0) throw new HandoffError('files_required', 'choose at least one audio file');
  if (fileIds.length > MAX_HANDOFF_FILES) throw new HandoffError('too_many_files', `at most ${MAX_HANDOFF_FILES} files at a time`);
  const host = await ownHost(account, request.host, fetcher);

  const db = getServerClient();
  const { data: torrent } = await db.from('bt_torrents').select('id, name, infohash').eq('id', request.torrentId).maybeSingle();
  if (!torrent) throw new HandoffError('not_found', 'no such torrent', 404);
  const { data: rows, error } = await db
    .from('bt_torrent_files')
    .select('id, name, size, mime_type, media_category, file_index')
    .eq('torrent_id', torrent.id)
    .in('id', fileIds);
  if (error) throw new HandoffError('lookup_failed', error.message, 500);
  const files = (rows ?? []).filter((one) => one.media_category === 'audio' || AUDIO.test(String(one.name)));
  if (files.length !== fileIds.length) throw new HandoffError('not_audio', 'only audio files from this torrent can be broadcast', 400);
  const { data: tags } = await db
    .from('bt_audio_metadata')
    .select('file_id, title, artist, album, track_number')
    .in('file_id', fileIds);
  const tagsOf = new Map((tags ?? []).map((one) => [one.file_id, one]));

  const expiresAt = Math.floor(now / 1000) + GRANT_TTL_SECONDS;
  const origin = getAppOrigin('https://bittorrented.com');
  const audience = originOf(host.url);
  const handed = await Promise.all(files.map(async (file) => {
    const meta = tagsOf.get(file.id);
    const grant = await createFileGrant({ userId, torrentId: torrent.id, fileId: file.id, audience, expiresAt });
    return {
      fileId: file.id,
      name: String(file.name),
      size: Number(file.size),
      mediaType: String(file.mime_type || 'audio/mpeg'),
      // Whether every piece is here is WebTorrent's to know while it runs;
      // Nixamp treats every file as pending until its own copy is whole.
      complete: false,
      url: `${origin}/api/v1/nixamp/files/${grant}`,
      expiresAt: expiresAt * 1000,
      metadata: {
        ...(meta?.title ? { title: meta.title } : {}),
        ...(meta?.artist ? { artist: meta.artist } : {}),
        ...(meta?.album ? { album: meta.album } : {}),
        ...(Number.isInteger(meta?.track_number) ? { track: meta!.track_number } : {}),
      },
    };
  }));
  const idempotencyKey = `bt:${userId}:${createHash('sha256').update([audience, torrent.id, ...fileIds.sort()].join('\n')).digest('hex').slice(0, 32)}`;

  const { accessToken } = await usableAccessToken(account, fetcher);
  const response = await fetcher(`${audience}/api/v1/integrations/bittorrented/handoffs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      idempotencyKey,
      name: (request.name?.trim() || String(torrent.name)).slice(0, 120),
      source: { torrentId: torrent.id, infohash: torrent.infohash },
      files: handed,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: { ...body, host: { name: host.name, url: host.url } } };
}

/** How a handoff is getting on, asked of the person's own server. */
export async function handoffStatus(account: NixampAccount, host: string, id: string, fetcher: typeof fetch = fetch): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!/^[0-9a-f]{16}$/.test(id)) throw new HandoffError('not_found', 'no such handoff', 404);
  const own = await ownHost(account, host, fetcher);
  const { accessToken } = await usableAccessToken(account, fetcher);
  const response = await fetcher(`${originOf(own.url)}/api/v1/integrations/bittorrented/handoffs/${id}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}
