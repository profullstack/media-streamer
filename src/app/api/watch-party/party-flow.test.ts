/**
 * A party from start to finish, through the real routes and the real store.
 *
 * These are the room's rules: who may host, who the host is after a reload, who is on
 * the list, what may be played, and that there is always a chat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const host = vi.hoisted(() => ({ canHostParty: vi.fn() }));

vi.mock('@/lib/auth', () => auth);
vi.mock('./_host', () => host);
vi.mock('@/lib/webhooks/hub', () => ({ emitWebhook: vi.fn(async () => undefined) }));

const { POST: create, GET: read, PATCH: setMedia } = await import('./route');
const { POST: join } = await import('./join/route');
const { POST: leave } = await import('./leave/route');
const { GET: readChat, POST: say } = await import('./chat/route');
const { PATCH: playback } = await import('./playback/route');
const { cleanMediaUrl } = await import('./_view');
const { deleteParty, getAllPartyCodes, touchMember, MEMBER_STALE_MS } = await import('./_store');

const BASE = 'https://bittorrented.test/api/watch-party';
const send = (method: string, path: string, body?: unknown): NextRequest =>
  new NextRequest(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });

const as = (id: string | null): void => {
  auth.getCurrentUser.mockResolvedValue(id ? { id, email: `${id}@b.test` } : null);
};

async function startParty(hostId = 'host-1'): Promise<string> {
  as(hostId);
  const res = await create(send('POST', '', { hostName: 'Ann' }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { party: { code: string } }).party.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const code of getAllPartyCodes()) deleteParty(code);
  host.canHostParty.mockResolvedValue(true);
  as('host-1');
});

describe('hosting', () => {
  it('needs a session', async () => {
    as(null);
    const res = await create(send('POST', '', { hostName: 'Ann' }));
    expect(res.status).toBe(401);
  });

  it('needs a plan, and says where to get one', async () => {
    host.canHostParty.mockResolvedValue(false);
    const res = await create(send('POST', '', { hostName: 'Ann' }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'paid_plan_required', feature: 'watch-party', upgradeUrl: '/pricing?upgrade=watch-party' });
    expect(getAllPartyCodes()).toEqual([]);
  });

  it('makes the signed-in user the host, whatever the body claims', async () => {
    const res = await create(send('POST', '', { hostName: ' Ann ', hostId: 'somebody-else' }));
    const { party } = (await res.json()) as { party: { hostId: string; hostName: string; code: string; serverTime: number } };
    expect(party.hostId).toBe('host-1');
    expect(party.hostName).toBe('Ann');
    expect(party.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(typeof party.serverTime).toBe('number');
  });

  it('refuses a missing name', async () => {
    expect((await create(send('POST', '', {}))).status).toBe(400);
    expect((await create(send('POST', '', { hostName: '   ' }))).status).toBe(400);
  });
});

describe('joining', () => {
  it('gives the host their party back on a reload instead of a second seat', async () => {
    const code = await startParty();
    const res = await join(send('POST', '/join', { code: code.toLowerCase(), userName: 'Ann' }));
    const body = (await res.json()) as { userId: string; isHost: boolean; party: { memberCount: number } };
    expect(body.userId).toBe('host-1');
    expect(body.isHost).toBe(true);
    expect(body.party.memberCount).toBe(1);
  });

  it('seats a member once however often they rejoin', async () => {
    const code = await startParty();
    as('member-1');
    await join(send('POST', '/join', { code, userName: 'Bob' }));
    const again = await join(send('POST', '/join', { code, userName: 'Bob' }));
    const body = (await again.json()) as { userId: string; isHost: boolean; party: { memberCount: number; members: { name: string }[] } };
    expect(body.userId).toBe('member-1');
    expect(body.isHost).toBe(false);
    expect(body.party.members.map((m) => m.name)).toEqual(['Ann', 'Bob']);
  });

  it('answers 404 for no party, 400 for a bad code or no name', async () => {
    expect((await join(send('POST', '/join', { code: 'NOPE00', userName: 'Bob' }))).status).toBe(404);
    expect((await join(send('POST', '/join', { code: 'no', userName: 'Bob' }))).status).toBe(400);
    const code = await startParty();
    expect((await join(send('POST', '/join', { code, userName: '' }))).status).toBe(400);
  });
});

describe('the member list', () => {
  it('drops a member who leaves', async () => {
    const code = await startParty();
    as('member-1');
    await join(send('POST', '/join', { code, userName: 'Bob' }));
    expect((await leave(send('POST', '/leave', { code }))).status).toBe(200);
    const res = await read(send('GET', `?code=${code}`));
    expect(((await res.json()) as { party: { memberCount: number } }).party.memberCount).toBe(1);
  });

  it('ends the party for everybody when the host leaves', async () => {
    const code = await startParty();
    const res = await leave(send('POST', '/leave', { code }));
    expect(await res.json()).toMatchObject({ ended: true });
    expect((await read(send('GET', `?code=${code}`))).status).toBe(410);
  });

  it('does not let one member remove another by naming their id', async () => {
    const code = await startParty();
    as('member-1');
    await join(send('POST', '/join', { code, userName: 'Bob' }));
    as('member-2');
    await leave(send('POST', '/leave', { code, userId: 'member-1' }));
    const res = await read(send('GET', `?code=${code}`));
    expect(((await res.json()) as { party: { memberCount: number } }).party.memberCount).toBe(2);
  });

  it('drops a member whose tab closed, on the next poll', async () => {
    const code = await startParty();
    as('member-1');
    await join(send('POST', '/join', { code, userName: 'Bob' }));
    // Last heard from long ago.
    touchMember(code, 'member-1', Date.now() - MEMBER_STALE_MS - 1000);
    const res = await read(send('GET', `?code=${code}&member=host-1`));
    const { party } = (await res.json()) as { party: { members: { id: string }[] } };
    expect(party.members.map((m) => m.id)).toEqual(['host-1']);
  });
});

describe('what a party plays', () => {
  it('takes an https link from the host and starts everybody at the beginning', async () => {
    const code = await startParty();
    await playback(send('PATCH', '/playback', { code, currentTime: 500, isPlaying: true }));
    const res = await setMedia(send('PATCH', '', { code, mediaUrl: 'https://cdn.example/film.mp4', mediaTitle: 'Film' }));
    expect(res.status).toBe(200);
    const { party } = (await res.json()) as { party: { mediaUrl: string; mediaTitle: string; state: string; playback: { currentTime: number; isPlaying: boolean } } };
    expect(party).toMatchObject({ mediaUrl: 'https://cdn.example/film.mp4', mediaTitle: 'Film', state: 'waiting' });
    expect(party.playback).toMatchObject({ currentTime: 0, isPlaying: false });
  });

  it('refuses a link that cannot be played, and anybody but the host', async () => {
    const code = await startParty();
    for (const mediaUrl of ['javascript:alert(1)', 'http://cdn.example/film.mp4', '/api/torrents', 'not a url']) {
      expect((await setMedia(send('PATCH', '', { code, mediaUrl }))).status, mediaUrl).toBe(400);
    }
    as('member-1');
    expect((await setMedia(send('PATCH', '', { code, mediaUrl: 'https://cdn.example/film.mp4', hostId: 'host-1' }))).status).toBe(403);
  });

  it('knows a playable link from one that is not', () => {
    expect(cleanMediaUrl('https://cdn.example/a.m3u8?x=1')).toBe('https://cdn.example/a.m3u8?x=1');
    expect(cleanMediaUrl('/api/stream?torrent=t&file=f')).toBe('/api/stream?torrent=t&file=f');
    expect(cleanMediaUrl('/api/seedbox/stream?id=1')).toBe('/api/seedbox/stream?id=1');
    for (const bad of ['http://x.test/a.mp4', '//evil.test/a.mp4', '/api/streamx?x', 'https://user:pw@x.test/a.mp4', 'data:video/mp4;base64,AA', '', 42, null]) {
      expect(cleanMediaUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('the chat', () => {
  it('is there from the start, for members, in order', async () => {
    const code = await startParty();
    expect(((await (await readChat(send('GET', `/chat?code=${code}`))).json()) as { messages: unknown[] }).messages).toEqual([]);

    const first = await say(send('POST', '/chat', { code, body: ' hello <b>all</b> ' }));
    expect(first.status).toBe(200);
    const line = ((await first.json()) as { message: { authorName: string; body: string; createdAt: string } }).message;
    expect(line).toMatchObject({ authorName: 'Ann', body: 'hello <b>all</b>' });

    as('member-1');
    await join(send('POST', '/join', { code, userName: 'Bob' }));
    await say(send('POST', '/chat', { code, body: 'hi Ann' }));

    const all = (await (await readChat(send('GET', `/chat?code=${code}`))).json()) as { messages: { authorName: string; body: string }[] };
    expect(all.messages.map((m) => `${m.authorName}: ${m.body}`)).toEqual(['Ann: hello <b>all</b>', 'Bob: hi Ann']);
    const fresh = (await (await readChat(send('GET', `/chat?code=${code}&after=${encodeURIComponent(line.createdAt)}`))).json()) as { messages: { body: string }[] };
    expect(fresh.messages.map((m) => m.body)).toEqual(['hi Ann']);
  });

  it('is for people in the party, and refuses nothing and too much', async () => {
    const code = await startParty();
    expect((await say(send('POST', '/chat', { code, body: '   ' }))).status).toBe(400);
    expect((await say(send('POST', '/chat', { code, body: 'x'.repeat(1001) }))).status).toBe(400);
    as('stranger');
    expect((await say(send('POST', '/chat', { code, body: 'hi' }))).status).toBe(403);
    // Naming a signed-in member's id is not being them.
    expect((await say(send('POST', '/chat', { code, body: 'hi', userId: 'host-1' }))).status).toBe(403);
    expect((await readChat(send('GET', '/chat?code=NOPE00'))).status).toBe(404);
  });
});
