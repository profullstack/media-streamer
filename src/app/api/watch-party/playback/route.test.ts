/**
 * The host's player is everybody's clock, and only the host's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const store = vi.hoisted(() => ({ getParty: vi.fn(), setParty: vi.fn() }));

vi.mock('@/lib/auth', () => auth);
vi.mock('../_store', () => store);

const { PATCH } = await import('./route');

function party(hostId = 'user-1') {
  return {
    id: 'p1',
    code: 'ABC123',
    hostId,
    hostName: 'Ann',
    mediaUrl: '/api/stream?torrent=t&file=f',
    mediaTitle: 'Dune',
    createdAt: new Date(),
    state: 'waiting' as const,
    members: [{ id: hostId, name: 'Ann', isHost: true, joinedAt: new Date() }],
    playback: { isPlaying: false, currentTime: 0, duration: 0, lastUpdate: 0 },
    settings: { allowGuestControl: false, maxMembers: 50, chatEnabled: true },
  };
}

function patch(body: unknown): NextRequest {
  return new NextRequest('https://bittorrented.test/api/watch-party/playback', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.test' });
  store.getParty.mockReturnValue(party());
});

describe('PATCH /api/watch-party/playback', () => {
  it('moves the party to where the host is, and marks it playing', async () => {
    const res = await PATCH(patch({ code: 'abc123', currentTime: 930.5, isPlaying: true, duration: 9000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.party.playback.currentTime).toBe(930.5);
    expect(body.party.playback.isPlaying).toBe(true);
    expect(body.party.state).toBe('playing');
    expect(body.party.playback.lastUpdate).toBeGreaterThan(0);
    expect(store.setParty).toHaveBeenCalledWith('ABC123', expect.objectContaining({ state: 'playing' }));
  });

  it('a pause is a paused party', async () => {
    store.getParty.mockReturnValue({ ...party(), state: 'playing' });
    const res = await PATCH(patch({ code: 'ABC123', isPlaying: false }));
    expect((await res.json()).party.state).toBe('paused');
  });

  it('refuses a member who presents the host id they saw in the member list', async () => {
    auth.getCurrentUser.mockResolvedValue({ id: 'user-2', email: 'b@b.test' });
    const res = await PATCH(patch({ code: 'ABC123', hostId: 'user-1', currentTime: 10 }));
    expect(res.status).toBe(403);
    expect(store.setParty).not.toHaveBeenCalled();
  });

  it('accepts the guest id for a guest-hosted party, which is all it has', async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    store.getParty.mockReturnValue(party('guest_1_abc'));
    const res = await PATCH(patch({ code: 'ABC123', hostId: 'guest_1_abc', currentTime: 10 }));
    expect(res.status).toBe(200);
  });

  it('will not take a position that is not one', async () => {
    const res = await PATCH(patch({ code: 'ABC123', currentTime: -5 }));
    expect(res.status).toBe(400);
  });

  it('says when the party is gone', async () => {
    store.getParty.mockReturnValue(undefined);
    expect((await PATCH(patch({ code: 'ABC123', currentTime: 1 }))).status).toBe(404);
    store.getParty.mockReturnValue({ ...party(), state: 'ended' });
    expect((await PATCH(patch({ code: 'ABC123', currentTime: 1 }))).status).toBe(410);
  });
});
