/**
 * The bridge endpoint: who may put a party on nixamp, and who may only read
 * where the room is.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const store = vi.hoisted(() => ({ getParty: vi.fn() }));
const nixamp = vi.hoisted(() => ({
  bridgeParty: vi.fn(),
  endBridgedParty: vi.fn(),
  getBridgedRoom: vi.fn(),
  pushPlayback: vi.fn(),
  NixampNotConnected: class NixampNotConnected extends Error {},
  NixampConnectionLost: class NixampConnectionLost extends Error {},
}));

vi.mock('@/lib/auth', () => auth);
vi.mock('../_store', () => store);
vi.mock('@/lib/nixamp', () => nixamp);
vi.mock('@/lib/watch-party', () => ({
  validatePartyCode: (code: string) => /^[A-Z0-9]{6}$/.test(code),
}));

const { GET, POST } = await import('./route');

const room = {
  partyCode: 'ABC123',
  nixampSite: 'https://nixamp.test',
  eventId: 'event-1',
  roomId: 'event-abc',
  slug: 'dune-together',
  nixampUrl: 'https://nixamp.test/live/dune-together',
};

const party = {
  code: 'ABC123',
  hostId: 'user-1',
  mediaTitle: 'Dune (2021)',
  playback: { currentTime: 930, isPlaying: true, duration: 9000, lastUpdate: Date.now() },
};

function post(body: unknown): NextRequest {
  return new NextRequest('https://bittorrented.test/api/watch-party/nixamp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.test' });
  store.getParty.mockReturnValue(party);
  nixamp.getBridgedRoom.mockResolvedValue(null);
  nixamp.bridgeParty.mockResolvedValue(room);
  nixamp.pushPlayback.mockResolvedValue(true);
  nixamp.endBridgedParty.mockResolvedValue(true);
});

describe('GET', () => {
  it('tells anybody where the room is, without an account', async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    nixamp.getBridgedRoom.mockResolvedValue(room);
    const res = await GET(new NextRequest('https://bittorrented.test/api/watch-party/nixamp?code=ABC123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bridged).toBe(true);
    expect(body.room.nixampUrl).toBe(room.nixampUrl);
  });

  it('answers "not bridged" rather than an error, because most parties are not', async () => {
    const res = await GET(new NextRequest('https://bittorrented.test/api/watch-party/nixamp?code=ABC123'));
    expect(res.status).toBe(200);
    expect((await res.json()).bridged).toBe(false);
  });

  it('will not take a code that is not one', async () => {
    const res = await GET(new NextRequest('https://bittorrented.test/api/watch-party/nixamp?code=nope'));
    expect(res.status).toBe(400);
  });
});

describe('POST', () => {
  it('needs somebody signed in', async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(401);
    expect(nixamp.bridgeParty).not.toHaveBeenCalled();
  });

  it('refuses a member who is not the host of the party', async () => {
    auth.getCurrentUser.mockResolvedValue({ id: 'user-2', email: 'c@d.test' });
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(403);
    expect(nixamp.bridgeParty).not.toHaveBeenCalled();
  });

  it('bridges for the host and answers the room link', async () => {
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room.nixampUrl).toBe(room.nixampUrl);
    expect(nixamp.bridgeParty).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', partyCode: 'ABC123', mediaTitle: 'Dune (2021)' })
    );
  });

  it('sends nixamp somewhere real when a sync says nothing about where it is', async () => {
    const res = await POST(post({ code: 'ABC123', action: 'sync' }));
    expect(res.status).toBe(200);
    // Falls back to the party's own recorded playback rather than 0, which
    // would drag everybody on nixamp back to the start of the film.
    expect(nixamp.pushPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ positionSeconds: 930, playing: true })
    );
  });

  it('reports a sync that did not land without calling the party broken', async () => {
    nixamp.pushPlayback.mockResolvedValue(false);
    const res = await POST(post({ code: 'ABC123', action: 'sync', positionSeconds: 12, playing: false }));
    expect(res.status).toBe(200);
    expect((await res.json()).synced).toBe(false);
  });

  it('points at the connect flow when no nixamp account is connected', async () => {
    nixamp.bridgeParty.mockRejectedValue(new nixamp.NixampNotConnected());
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(409);
    expect((await res.json()).connect).toBe('/api/v1/nixamp/oauth/start');
  });

  it('says to connect again when the grant has been withdrawn', async () => {
    nixamp.bridgeParty.mockRejectedValue(new nixamp.NixampConnectionLost());
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/connection has ended/i);
  });

  it('404s for a party this process has never heard of', async () => {
    store.getParty.mockReturnValue(undefined);
    const res = await POST(post({ code: 'ABC123' }));
    expect(res.status).toBe(404);
  });

  it('will not take an action it does not have', async () => {
    const res = await POST(post({ code: 'ABC123', action: 'delete-everything' }));
    expect(res.status).toBe(400);
  });
});
