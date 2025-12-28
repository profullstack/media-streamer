/**
 * Watch Party API Route Tests
 *
 * Tests for POST /api/watch-party (create) and GET /api/watch-party (get by code)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import * as store from './_store';

// Mock the store module
vi.mock('./_store', () => ({
  getParty: vi.fn(),
  setParty: vi.fn(),
  cleanupOldParties: vi.fn(),
}));

// Mock the watch-party library
vi.mock('@/lib/watch-party', () => ({
  createWatchParty: vi.fn(({ hostId, hostName, mediaUrl, mediaTitle, settings }) => ({
    id: 'party-123',
    code: 'ABC123',
    hostId,
    hostName,
    mediaUrl: mediaUrl ?? '',
    mediaTitle: mediaTitle ?? 'Watch Party',
    state: 'waiting',
    members: [{ id: hostId, name: hostName, isHost: true, joinedAt: new Date() }],
    playback: { currentTime: 0, isPlaying: false, duration: 0, lastUpdate: Date.now() },
    settings: {
      maxMembers: settings?.maxMembers ?? 50,
      chatEnabled: settings?.chatEnabled ?? true,
      allowGuestControl: settings?.allowGuestControl ?? false,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
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

describe('Watch Party API - POST /api/watch-party', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a party with valid hostName', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostName: 'TestHost' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.party).toBeDefined();
    expect(data.party.code).toBe('ABC123');
    expect(data.party.hostName).toBe('TestHost');
    expect(data.party.state).toBe('waiting');
    expect(store.setParty).toHaveBeenCalledWith('ABC123', expect.any(Object));
    expect(store.cleanupOldParties).toHaveBeenCalled();
  });

  it('should create a party with custom hostId', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostId: 'user-456', hostName: 'CustomHost' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.party.hostId).toBe('user-456');
  });

  it('should create a party with media URL and title', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({
        hostName: 'MovieHost',
        mediaUrl: 'http://example.com/movie.mp4',
        mediaTitle: 'Awesome Movie',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.mediaUrl).toBe('http://example.com/movie.mp4');
    expect(data.party.mediaTitle).toBe('Awesome Movie');
  });

  it('should create a party with custom settings', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({
        hostName: 'SettingsHost',
        settings: {
          maxMembers: 10,
          chatEnabled: false,
          allowGuestControl: true,
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.settings.maxMembers).toBe(10);
    expect(data.party.settings.chatEnabled).toBe(false);
    expect(data.party.settings.allowGuestControl).toBe(true);
  });

  it('should return 400 when hostName is missing', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('hostName is required');
  });

  it('should return 400 when hostName is not a string', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostName: 123 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('hostName is required');
  });

  it('should return 400 when hostName is empty string', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostName: '' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('hostName is required');
  });

  it('should generate guest ID when hostId not provided', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostName: 'GuestHost' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.hostId).toMatch(/^guest_\d+_[a-z0-9]+$/);
  });

  it('should return createdAt as ISO string', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: JSON.stringify({ hostName: 'DateHost' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should handle JSON parse errors gracefully', async () => {
    const request = new NextRequest('http://localhost/api/watch-party', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create watch party');
  });
});

describe('Watch Party API - GET /api/watch-party', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return party when valid code provided', async () => {
    const mockParty = createMockParty({
      mediaUrl: 'http://example.com/video.mp4',
      mediaTitle: 'Test Video',
    });

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=ABC123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.party.code).toBe('ABC123');
    expect(data.party.hostName).toBe('TestHost');
    expect(data.party.memberCount).toBe(1);
    expect(data.party.members).toHaveLength(1);
    expect(data.party.members[0].name).toBe('TestHost');
    expect(data.party.members[0].isHost).toBe(true);
  });

  it('should normalize code to uppercase', async () => {
    const mockParty = createMockParty();

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=abc123');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(store.getParty).toHaveBeenCalledWith('ABC123');
  });

  it('should return 400 when code is missing', async () => {
    const request = new NextRequest('http://localhost/api/watch-party');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Party code is required');
  });

  it('should return 400 when code format is invalid', async () => {
    const request = new NextRequest('http://localhost/api/watch-party?code=ABC');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid party code format');
  });

  it('should return 400 for code with special characters', async () => {
    const request = new NextRequest('http://localhost/api/watch-party?code=ABC!@#');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid party code format');
  });

  it('should return 404 when party not found', async () => {
    vi.mocked(store.getParty).mockReturnValue(undefined);

    const request = new NextRequest('http://localhost/api/watch-party?code=XYZ789');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Party not found');
  });

  it('should return 410 when party has ended', async () => {
    const mockParty = createMockParty({ state: 'ended' });

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=ABC123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe('Party has ended');
  });

  it('should include playback state in response', async () => {
    const mockParty = createMockParty({
      state: 'playing',
      playback: { currentTime: 120.5, isPlaying: true, duration: 3600, lastUpdate: Date.now() },
    });

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=ABC123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.playback.currentTime).toBe(120.5);
    expect(data.party.playback.isPlaying).toBe(true);
  });

  it('should include settings in response', async () => {
    const mockParty = createMockParty({
      settings: { maxMembers: 25, chatEnabled: false, allowGuestControl: true },
    });

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=ABC123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.settings.maxMembers).toBe(25);
    expect(data.party.settings.chatEnabled).toBe(false);
    expect(data.party.settings.allowGuestControl).toBe(true);
  });

  it('should return multiple members correctly', async () => {
    const mockParty = createMockParty({
      members: [
        { id: 'host-1', name: 'Host', isHost: true, joinedAt: new Date() },
        { id: 'guest-1', name: 'Guest1', isHost: false, joinedAt: new Date() },
        { id: 'guest-2', name: 'Guest2', isHost: false, joinedAt: new Date() },
      ],
    });

    vi.mocked(store.getParty).mockReturnValue(mockParty);

    const request = new NextRequest('http://localhost/api/watch-party?code=ABC123');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.party.memberCount).toBe(3);
    expect(data.party.members).toHaveLength(3);
    expect(data.party.members.filter((m: { isHost: boolean }) => m.isHost)).toHaveLength(1);
  });
});
