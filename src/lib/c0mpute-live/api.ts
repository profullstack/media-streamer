/**
 * The c0mpute Live API (https://c0mpute.com/api/v1/live) for one credential.
 *
 * The credential lives only in the closure `liveApi` returns; errors carry
 * c0mpute's code and status, never the credential or a response body (a create
 * response holds a stream key).
 */

import { C0mputeError, readJson, str, type C0mputeConfig, type FetchLike, type Visibility } from './oauth';

export type C0mputeTier = 'paid' | 'free';

export interface LiveAccount {
  accountLabel: string | null;
  tier: C0mputeTier | null;
  balanceUsd: number | null;
  usdPerGb: number | null;
  freeTier: { maxHeight: number | null; maxViewers: number | null };
  topUpUrl: string | null;
}

export interface LiveStream {
  id: string;
  name: string;
  watchUrl: string | null;
  playbackUrl: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function streamFrom(o: unknown): LiveStream | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const id = str(r.id, 200);
  const name = str(r.name, 200);
  if (!id || !name) return null;
  return { id, name, watchUrl: httpsUrl(r.watch_url), playbackUrl: httpsUrl(r.playback_url) };
}

export type CreateStreamResult = { conflict: true } | { conflict: false; stream: LiveStream; streamKey: string };

export interface LiveApi {
  me(): Promise<LiveAccount>;
  createStream(input: { name: string; title?: string; visibility?: Visibility }): Promise<CreateStreamResult>;
  listStreams(): Promise<LiveStream[]>;
  rekey(streamId: string): Promise<string>;
}

export function liveApi(cfg: Pick<C0mputeConfig, 'origin'>, credential: string, fetchImpl: FetchLike = fetch): LiveApi {
  const base = `${cfg.origin}/api/v1/live`;
  const call = async (method: string, path: string, body?: unknown): Promise<{ res: Response; json: Record<string, unknown> }> => {
    const res = await fetchImpl(base + path, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { res, json: await readJson(res) };
  };
  const fail = (what: string, res: Response, json: Record<string, unknown>): never => {
    const err = json.error as { code?: unknown } | undefined;
    const code = res.status === 401 ? 'unauthorized' : (str(err?.code, 60) ?? `http_${String(res.status)}`);
    throw new C0mputeError(code, `c0mpute ${what} failed (${String(res.status)})`, res.status);
  };

  return {
    async me() {
      const { res, json } = await call('GET', '/me');
      if (!res.ok) fail('account lookup', res, json);
      const account = (json.account ?? {}) as Record<string, unknown>;
      const free = (json.free_tier ?? {}) as Record<string, unknown>;
      const topUp = json.top_up;
      const tier = json.tier;
      const topUpUrl =
        httpsUrl(topUp) ??
        (topUp && typeof topUp === 'object' ? httpsUrl((topUp as Record<string, unknown>).url) : null);
      return {
        accountLabel: str(account.label, 200) ?? str(account.id, 200),
        tier: tier === 'paid' || tier === 'free' ? tier : null,
        balanceUsd: num(json.balance_usd),
        usdPerGb: num(json.usd_per_gb),
        freeTier: { maxHeight: num(free.max_height), maxViewers: num(free.max_viewers) },
        topUpUrl,
      };
    },

    /** 201: the stream and its one-time key. `conflict: true` on 409 (name taken). */
    async createStream(input) {
      const { res, json } = await call('POST', '/streams', input);
      if (res.status === 409) return { conflict: true };
      if (!res.ok) fail('stream create', res, json);
      const stream = streamFrom(json);
      const streamKey = str(json.stream_key, 500);
      if (!stream || !streamKey) {
        throw new C0mputeError('bad_response', 'c0mpute stream create returned no stream key');
      }
      return { conflict: false, stream, streamKey };
    },

    async listStreams() {
      const { res, json } = await call('GET', '/streams');
      if (!res.ok) fail('stream list', res, json);
      const list: unknown = Array.isArray(json)
        ? json
        : Array.isArray(json.streams)
          ? json.streams
          : Array.isArray(json.data)
            ? json.data
            : [];
      return (list as unknown[]).map(streamFrom).filter((s): s is LiveStream => s !== null);
    },

    /** A fresh key for an existing stream (the old one stops working). */
    async rekey(streamId) {
      const { res, json } = await call('POST', `/streams/${encodeURIComponent(streamId)}/key`);
      if (!res.ok) fail('stream key', res, json);
      const streamKey = str(json.stream_key, 500);
      if (!streamKey) throw new C0mputeError('bad_response', 'c0mpute returned no stream key');
      return streamKey;
    },
  };
}
