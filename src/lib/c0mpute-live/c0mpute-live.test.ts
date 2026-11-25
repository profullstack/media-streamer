import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveStreamStore, StoredStream } from './connect';
import { streamNameFor } from './connect';
import { openStreamKey, sealStreamKey } from './crypto';
import { finishConnect, startConnect, type FlowDeps } from './flow';
import {
  CALLBACK_PATH,
  beginConnect,
  decodePending,
  defaultEndpoints,
  encodePending,
  pkceChallenge,
  redirectUri,
  sameState,
  type C0mputeConfig,
  type ClientCache,
  type PendingAuth,
} from './oauth';
import {
  IDLE_MS,
  LiveCapacityError,
  MAX_CHUNK_BYTES,
  acceptedMimeType,
  activeSessionCount,
  buildFfmpegArgs,
  checkChunk,
  liveStateOf,
  resetSessionsForTest,
  startSession,
  stopSessionsOf,
  writeChunk,
} from './sessions';

const cfg: C0mputeConfig = { origin: 'https://c0mpute.com', siteUrl: 'https://bittorrented.com', stateSecret: 'state-secret' };
const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const STREAM_KEY = 'sk_live_SECRETKEY123';

describe('pending cookie', () => {
  const pending = (over: Partial<PendingAuth> = {}): PendingAuth => ({
    state: 'st',
    verifier: 'ver',
    clientId: 'client',
    userId: USER,
    visibility: 'unlisted',
    retried: false,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...over,
  });

  it('opens what it sealed', () => {
    expect(decodePending(encodePending(pending({ visibility: 'public' }), 'k'), 'k')).toEqual(pending({ visibility: 'public' }));
  });

  it('refuses an edited body, a wrong key and junk', () => {
    const sealed = encodePending(pending(), 'k');
    const [body, sig] = sealed.split('.');
    const forged = Buffer.from(JSON.stringify(pending({ userId: 'someone-else' }))).toString('base64url');
    expect(decodePending(`${forged}.${sig}`, 'k')).toBeNull();
    expect(decodePending(`${body}.${sig.slice(0, -2)}AA`, 'k')).toBeNull();
    expect(decodePending(sealed, 'other-key')).toBeNull();
    expect(decodePending('nonsense', 'k')).toBeNull();
    expect(decodePending(undefined, 'k')).toBeNull();
  });

  it('refuses an expired one', () => {
    expect(decodePending(encodePending(pending({ exp: Math.floor(Date.now() / 1000) - 1 }), 'k'), 'k')).toBeNull();
  });

  it('compares state exactly', () => {
    expect(sameState('abc', 'abc')).toBe(true);
    expect(sameState('abc', 'abd')).toBe(false);
    expect(sameState('abc', 'abcd')).toBe(false);
    expect(sameState('abc', null)).toBe(false);
  });
});

describe('PKCE and the authorize URL', () => {
  it('matches the RFC 7636 example', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('asks for live:publish with S256 and the canonical redirect', () => {
    const { pending, url } = beginConnect(cfg, defaultEndpoints(cfg.origin), { clientId: 'cid', userId: USER, visibility: 'public' });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://c0mpute.com/oauth/authorize');
    expect(u.searchParams.get('scope')).toBe('live:publish');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBe(pkceChallenge(pending.verifier));
    expect(u.searchParams.get('redirect_uri')).toBe(`https://bittorrented.com${CALLBACK_PATH}`);
    expect(u.searchParams.get('state')).toBe(pending.state);
    expect(pending.visibility).toBe('public');
    expect(url).not.toContain(pending.verifier);
  });
});

describe('stream name', () => {
  it('is bt- and the first 12 hex of the user id', () => {
    expect(streamNameFor(USER)).toBe('bt-0f8fad5bd9cb');
    expect(streamNameFor(USER.toUpperCase())).toBe('bt-0f8fad5bd9cb');
  });
  it('refuses something that is not a uuid', () => {
    expect(() => streamNameFor('guest')).toThrow();
  });
});

describe('stream key at rest', () => {
  it('round trips and never holds the key in the clear', () => {
    const sealed = sealStreamKey(STREAM_KEY, 'secret');
    expect(sealed).not.toContain(STREAM_KEY);
    expect(openStreamKey(sealed, 'secret')).toBe(STREAM_KEY);
    expect(sealStreamKey(STREAM_KEY, 'secret')).not.toBe(sealed);
  });
  it('refuses a tampered value and a wrong secret', () => {
    const sealed = sealStreamKey(STREAM_KEY, 'secret');
    const parts = sealed.split(':');
    const flipped = Buffer.from(parts[3], 'base64url');
    flipped[0] ^= 1;
    expect(() => openStreamKey([parts[0], parts[1], parts[2], flipped.toString('base64url')].join(':'), 'secret')).toThrow();
    expect(() => openStreamKey(sealed, 'other')).toThrow();
    expect(() => openStreamKey('plain', 'secret')).toThrow();
  });
});

describe('ffmpeg arguments', () => {
  const args = buildFfmpegArgs(STREAM_KEY);
  it('puts the publish URL last and the key nowhere else', () => {
    expect(args.at(-1)).toBe(`rtmp://live.c0mpute.com/live/${STREAM_KEY}`);
    expect(args.slice(0, -1).some((a) => a.includes(STREAM_KEY))).toBe(false);
    expect(args.slice(-3, -1)).toEqual(['-f', 'flv']);
  });
  it('caps at 720p, reads stdin and cuts a keyframe every two seconds', () => {
    expect(args[args.indexOf('-vf') + 1]).toBe("scale=-2:'min(720,ih)'");
    expect(args[args.indexOf('-i') + 1]).toBe('pipe:0');
    expect(args[args.indexOf('-g') + 1]).toBe('60');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
  });
  it('refuses a key that would break out of the URL', () => {
    for (const bad of ['', 'a b', 'key/../x', 'key?x=1', 'key\n-y']) expect(() => buildFfmpegArgs(bad)).toThrow();
  });
});

describe('chunk checks', () => {
  it('takes the next chunk only', () => {
    expect(checkChunk(0, 0, 10)).toEqual({ ok: true });
    expect(checkChunk(3, 2, 10)).toMatchObject({ ok: false, status: 409 });
    expect(checkChunk(3, 4, 10)).toMatchObject({ ok: false, status: 409 });
  });
  it('refuses a bad seq, an empty chunk and an oversized one', () => {
    expect(checkChunk(0, Number.NaN, 10)).toMatchObject({ ok: false, status: 400 });
    expect(checkChunk(0, -1, 10)).toMatchObject({ ok: false, status: 400 });
    expect(checkChunk(0, '0', 10)).toMatchObject({ ok: false, status: 400 });
    expect(checkChunk(0, 0, 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkChunk(0, 0, MAX_CHUNK_BYTES)).toEqual({ ok: true });
    expect(checkChunk(0, 0, MAX_CHUNK_BYTES + 1)).toMatchObject({ ok: false, status: 413 });
  });
  it('accepts what MediaRecorder makes and nothing else', () => {
    expect(acceptedMimeType('video/webm;codecs=h264,opus')).toBe('video/webm;codecs=h264,opus');
    expect(acceptedMimeType('video/webm')).toBe('video/webm');
    expect(acceptedMimeType('video/mp4;codecs="avc1.42E01E, mp4a.40.2"')).not.toBeNull();
    expect(acceptedMimeType('text/html')).toBeNull();
    expect(acceptedMimeType('video/webm; rm -rf')).toBeNull();
    expect(acceptedMimeType(undefined)).toBeNull();
  });
});

describe('sessions', () => {
  class FakeStdin extends EventEmitter {
    written: Uint8Array[] = [];
    destroyed = false;
    write(chunk: Uint8Array, cb: (err?: Error | null) => void): boolean {
      this.written.push(chunk);
      queueMicrotask(() => cb(null));
      return true;
    }
    end(): void {
      this.destroyed = true;
    }
  }
  class FakeProcess extends EventEmitter {
    stdin = new FakeStdin();
    exitCode: number | null = null;
    kill = vi.fn(() => {
      this.exitCode = 0;
      return true;
    });
  }
  const spawned: { args: string[]; proc: FakeProcess }[] = [];
  const spawner = (args: string[]): ChildProcess => {
    const proc = new FakeProcess();
    spawned.push({ args, proc });
    return proc as unknown as ChildProcess;
  };
  const other = (n: number): string => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

  beforeEach(() => {
    vi.useFakeTimers();
    spawned.length = 0;
    delete process.env.C0MPUTE_LIVE_MAX_SESSIONS;
  });
  afterEach(() => {
    resetSessionsForTest();
    vi.useRealTimers();
  });

  it('writes chunks in order to the encoder', async () => {
    const { sessionId } = startSession(USER, STREAM_KEY, spawner);
    expect(spawned[0].args.at(-1)).toContain(STREAM_KEY);
    expect(await writeChunk(USER, sessionId, 0, new Uint8Array([1]))).toEqual({ ok: true });
    expect(await writeChunk(USER, sessionId, 1, new Uint8Array([2]))).toEqual({ ok: true });
    expect(await writeChunk(USER, sessionId, 1, new Uint8Array([3]))).toMatchObject({ ok: false, status: 409 });
    expect(spawned[0].proc.stdin.written.map((c) => c[0])).toEqual([1, 2]);
    expect(liveStateOf(USER).active).toBe(true);
  });

  it("hides another member's session", async () => {
    const { sessionId } = startSession(USER, STREAM_KEY, spawner);
    expect(await writeChunk(other(1), sessionId, 0, new Uint8Array([1]))).toMatchObject({ ok: false, status: 404 });
    expect(await writeChunk(USER, 'nope', 0, new Uint8Array([1]))).toMatchObject({ ok: false, status: 404 });
    expect(spawned[0].proc.stdin.written).toHaveLength(0);
  });

  it('keeps one session per member', () => {
    const first = startSession(USER, STREAM_KEY, spawner);
    const second = startSession(USER, STREAM_KEY, spawner);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(activeSessionCount()).toBe(1);
    expect(spawned[0].proc.stdin.destroyed).toBe(true);
  });

  it('refuses a session past the global maximum', () => {
    process.env.C0MPUTE_LIVE_MAX_SESSIONS = '2';
    startSession(other(1), STREAM_KEY, spawner);
    startSession(other(2), STREAM_KEY, spawner);
    expect(() => startSession(other(3), STREAM_KEY, spawner)).toThrow(LiveCapacityError);
    expect(activeSessionCount()).toBe(2);
  });

  it('stops a session that goes quiet, and says why', () => {
    startSession(USER, STREAM_KEY, spawner);
    vi.advanceTimersByTime(IDLE_MS + 1);
    expect(liveStateOf(USER)).toMatchObject({ active: false, ended: { reason: 'idle' } });
    vi.advanceTimersByTime(3001);
    expect(spawned[0].proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('cleans up when the encoder exits, and on stop', async () => {
    const { sessionId } = startSession(USER, STREAM_KEY, spawner);
    spawned[0].proc.exitCode = 1;
    spawned[0].proc.emit('exit', 1);
    expect(liveStateOf(USER)).toMatchObject({ active: false, ended: { reason: 'encoder_exit' } });
    expect(await writeChunk(USER, sessionId, 0, new Uint8Array([1]))).toMatchObject({ ok: false, status: 404 });

    startSession(USER, STREAM_KEY, spawner);
    expect(stopSessionsOf(USER)).toBe(1);
    expect(liveStateOf(USER)).toMatchObject({ active: false, ended: { reason: 'stopped' } });
    expect(stopSessionsOf(USER)).toBe(0);
  });
});

describe('connect flow', () => {
  function memory(): { store: LiveStreamStore; rows: Map<string, StoredStream>; cache: ClientCache & { id: string | null; cleared: number } } {
    const rows = new Map<string, StoredStream>();
    const cache = {
      id: null as string | null,
      cleared: 0,
      async getClient() {
        return cache.id;
      },
      async saveClient(_uri: string, clientId: string) {
        cache.id = clientId;
      },
      async clearClient() {
        cache.id = null;
        cache.cleared += 1;
      },
    };
    return {
      rows,
      cache,
      store: {
        async get(userId) {
          return rows.get(userId) ?? null;
        },
        async save(row) {
          rows.set(row.user_id, row);
        },
        async remove(userId) {
          rows.delete(userId);
        },
      },
    };
  }

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  interface Upstream {
    createStatus?: number;
    meStatus?: number;
    tokenError?: string;
    calls: string[];
    registered: number;
  }

  function fakeC0mpute(up: Upstream): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      const method = init?.method ?? 'GET';
      up.calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/.well-known/oauth-authorization-server') return json({}, 404);
      if (url.pathname === '/api/oauth/register') {
        up.registered += 1;
        return json({ client_id: `client-${String(up.registered)}` }, 201);
      }
      if (url.pathname === '/api/oauth/token') {
        if (up.tokenError) return json({ error: up.tokenError }, 400);
        const form = new URLSearchParams(String(init?.body));
        expect(form.get('redirect_uri')).toBe(redirectUri(cfg));
        expect(form.get('code_verifier')).toBeTruthy();
        return json({ access_token: 'c0k_TOKEN' });
      }
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer c0k_TOKEN');
      if (url.pathname === '/api/v1/live/me') {
        if (up.meStatus) return json({ error: { code: 'nope' } }, up.meStatus);
        return json({ account: { label: 'anthony' }, tier: 'free', balance_usd: 0 });
      }
      if (url.pathname === '/api/v1/live/streams' && method === 'POST') {
        if (up.createStatus === 409) return json({ error: { code: 'conflict' } }, 409);
        const body = JSON.parse(String(init?.body)) as { name: string; visibility: string };
        expect(body.name).toBe('bt-0f8fad5bd9cb');
        return json(
          { id: 'new1', name: body.name, stream_key: STREAM_KEY, watch_url: 'https://c0mpute.com/live/new1', playback_url: 'https://c0mpute.com/live/new1/index.m3u8' },
          201
        );
      }
      if (url.pathname === '/api/v1/live/streams') {
        return json({ streams: [{ id: 'other', name: 'something' }, { id: 'old1', name: 'bt-0f8fad5bd9cb', watch_url: 'https://c0mpute.com/live/old1' }] });
      }
      if (url.pathname === '/api/v1/live/streams/old1/key') return json({ stream_key: 'REKEYED_KEY' });
      return json({}, 404);
    }) as typeof fetch;
  }

  async function roundTrip(up: Upstream, over: { sessionUserId?: string; error?: string } = {}) {
    const mem = memory();
    const deps: FlowDeps = {
      cfg,
      cache: mem.cache,
      store: mem.store,
      seal: (k) => sealStreamKey(k, 'secret'),
      fetchImpl: fakeC0mpute(up),
    };
    const started = await startConnect(deps, { userId: USER, visibility: 'unlisted' });
    const state = new URL(started.url).searchParams.get('state');
    const finished = await finishConnect(deps, {
      code: over.error ? null : 'CODE',
      state,
      error: over.error ?? null,
      cookie: started.cookie,
      sessionUserId: over.sessionUserId ?? USER,
    });
    return { mem, deps, started, finished };
  }

  const upstream = (over: Partial<Upstream> = {}): Upstream => ({ calls: [], registered: 0, ...over });

  it('connects: registers once, makes the stream, stores only a sealed key', async () => {
    const up = upstream();
    const { mem, finished } = await roundTrip(up);
    expect(finished).toEqual({ outcome: 'connected' });
    expect(up.registered).toBe(1);
    const row = mem.rows.get(USER);
    expect(row).toMatchObject({ stream_id: 'new1', watch_url: 'https://c0mpute.com/live/new1', account_label: 'anthony', visibility: 'unlisted' });
    expect(JSON.stringify(row)).not.toContain(STREAM_KEY);
    expect(JSON.stringify(row)).not.toContain('c0k_TOKEN');
    expect(openStreamKey(row?.stream_key_enc ?? '', 'secret')).toBe(STREAM_KEY);
  });

  it('on a name conflict finds the stream and takes a fresh key', async () => {
    const up = upstream({ createStatus: 409 });
    const { mem, finished } = await roundTrip(up);
    expect(finished.outcome).toBe('connected');
    expect(up.calls).toContain('POST /api/v1/live/streams/old1/key');
    const row = mem.rows.get(USER);
    expect(row?.stream_id).toBe('old1');
    expect(openStreamKey(row?.stream_key_enc ?? '', 'secret')).toBe('REKEYED_KEY');
  });

  it('fails cleanly on a 401 and stores nothing', async () => {
    const { mem, finished } = await roundTrip(upstream({ meStatus: 401 }));
    expect(finished).toEqual({ outcome: 'failed', reason: 'unauthorized' });
    expect(mem.rows.size).toBe(0);
  });

  it('registers again, once, when c0mpute forgot the client', async () => {
    const up = upstream({ tokenError: 'invalid_client' });
    const { mem, deps, finished } = await roundTrip(up);
    expect(finished.outcome).toBe('failed');
    expect(finished.restart?.url).toContain('client_id=client-2');
    expect(mem.cache.cleared).toBe(1);
    // The second time round it does not restart again.
    const again = await finishConnect(deps, {
      code: 'CODE',
      state: new URL(finished.restart?.url ?? '').searchParams.get('state'),
      error: null,
      cookie: finished.restart?.cookie,
      sessionUserId: USER,
    });
    expect(again).toEqual({ outcome: 'failed', reason: 'invalid_client' });
  });

  it('refuses another session, a wrong state and a missing cookie; reports a denial', async () => {
    expect((await roundTrip(upstream(), { sessionUserId: 'someone-else' })).finished).toMatchObject({ outcome: 'failed', reason: 'other_user' });
    expect((await roundTrip(upstream(), { error: 'access_denied' })).finished.outcome).toBe('denied');

    const { deps, started } = await roundTrip(upstream());
    expect(
      await finishConnect(deps, { code: 'CODE', state: 'wrong', error: null, cookie: started.cookie, sessionUserId: USER })
    ).toMatchObject({ outcome: 'failed', reason: 'bad_state' });
    expect(
      await finishConnect(deps, { code: 'CODE', state: 'x', error: null, cookie: undefined, sessionUserId: USER })
    ).toMatchObject({ outcome: 'failed', reason: 'no_pending' });
  });
});
