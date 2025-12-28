/**
 * Watch Party Join API Route Tests
 *
 * Tests for POST /api/watch-party/join
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import * as store from '../_store';

// Mock the store module
vi.mock('../_store', () => ({
  getParty: vi.fn(),
  setParty: vi.fn(),
}));

// Mock the watch-party library
vi.mock('@/lib/watch-party', () => ({
  joinWatchParty: vi.fn((party, options) => ({
    ...party,
    members: [
      ...party.members,
      { id: options.userId, name: options.userName, isHost: false, joinedAt: new Date() },
    ],
  })),
  validatePartyCode: vi.fn((code: string) => /^[A-Z0-9]{6}$/.test(code)),
}));

// Helper to create a valid mock party
function createMockParty(overrides: Record<string, unknown> = {}) {
  return {
    id: 'party-123',
    code: 'ABC123',
    hostId: 'host-1',
    hostName: 'TestHost',
    mediaUrl: '',
    mediaTitle: 'Watch Party',
    state: 'waiting' as const,
    members: [{ id: 'host-1', name: 'TestHost', isHost: true, joinedAt: new Date() }],
    playback: { currentTime: 0, isPlaying: false, duration: 0, lastUpdate: Date.now() },
    settings: { maxMembers: 50, chatEnabled: true, allowGuestControl: false },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('Watch Party Join API - POST /api/watch-party/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should join a party with valid code and userName', async () => {
    const mockParty = createMockParty();
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.party).toBeDefined();
    expect(data.party.memberCount).toBe(2);
    expect(data.userId).toMatch(/^guest_\d+_[a-z0-9]+$/);
    expect(store.setParty).toHaveBeenCalled();
  });

  it('should join with custom userId', async () => {
    const mockParty = createMockParty();
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser', userId: 'custom-user-123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.userId).toBe('custom-user-123');
  });

  it('should normalize code to uppercase', async () => {
    const mockParty = createMockParty();
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'abc123', userName: 'NewUser' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(store.getParty).toHaveBeenCalledWith('ABC123');
  });

  it('should return 400 when code is missing', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Party code is required');
  });

  it('should return 400 when code is not a string', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 123456, userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Party code is required');
  });

  it('should return 400 when userName is missing', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('userName is required');
  });

  it('should return 400 when userName is not a string', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 123 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('userName is required');
  });

  it('should return 400 when code format is invalid', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid party code format');
  });

  it('should return 404 when party not found', async () => {
    vi.mocked(store.getParty).mockReturnValue(undefined);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'XYZ789', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Party not found');
  });

  it('should return 410 when party has ended', async () => {
    const mockParty = createMockParty({ state: 'ended' });
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe('Party has ended');
  });

  it('should return 403 when party is full', async () => {
    const mockParty = createMockParty({
      settings: { maxMembers: 1, chatEnabled: true, allowGuestControl: false },
    });
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Party is full');
  });

  it('should return member list in response', async () => {
    const mockParty = createMockParty();
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.members).toBeDefined();
    expect(Array.isArray(data.party.members)).toBe(true);
    expect(data.party.members[0]).toHaveProperty('id');
    expect(data.party.members[0]).toHaveProperty('name');
    expect(data.party.members[0]).toHaveProperty('isHost');
  });

  it('should return playback state in response', async () => {
    const mockParty = createMockParty({
      playback: { currentTime: 60, isPlaying: true, duration: 3600, lastUpdate: Date.now() },
    });
    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', userName: 'NewUser' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.playback).toBeDefined();
    expect(data.party.playback.currentTime).toBe(60);
    expect(data.party.playback.isPlaying).toBe(true);
  });

  it('should handle JSON parse errors gracefully', async () => {
    const request = new NextRequest('http://localhost/api/watch-party/join', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to join watch party');
  });
});
