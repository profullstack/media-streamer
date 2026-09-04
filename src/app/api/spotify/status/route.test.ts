/**
 * The status route is also the lazy starter: after a deploy nothing runs
 * until a paired user loads the page, and that first request must bring the
 * device back without asking them to pair again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

const mockGetStatus = vi.fn();
const mockEnsureRunning = vi.fn();
const mockGetCredentials = vi.fn();
vi.mock('@/lib/spotify', () => ({
  getSpotifyPlayerManager: () => ({ getStatus: mockGetStatus, ensureRunning: mockEnsureRunning }),
  getSpotifyCredentials: (userId: string) => mockGetCredentials(userId),
}));

const stopped = {
  state: 'stopped',
  deviceName: 'BitTorrented',
  pairing: null,
  nowPlaying: null,
  hasStream: false,
  error: null,
};

describe('GET /api/spotify/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
    mockGetStatus.mockReturnValue(stopped);
    mockGetCredentials.mockResolvedValue(null);
  });

  it('requires a session', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(401);
  });

  it('reports not connected when nothing is stored and nothing runs', async () => {
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(body.connected).toBe(false);
    expect(body.state).toBe('stopped');
    expect(mockEnsureRunning).not.toHaveBeenCalled();
  });

  it('starts librespot from stored credentials when the process is not running', async () => {
    mockGetCredentials.mockResolvedValue({ userId: 'user-1', username: 'anthony', credentialsJson: '{"u":1}' });
    mockEnsureRunning.mockReturnValue({ ...stopped, state: 'connecting' });
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(mockEnsureRunning).toHaveBeenCalledWith('user-1', '{"u":1}');
    expect(body.connected).toBe(true);
    expect(body.username).toBe('anthony');
    expect(body.state).toBe('connecting');
    expect(body.streamUrl).toBe('/api/spotify/stream/index.m3u8');
  });

  it('does not touch the database while pairing is in progress', async () => {
    mockGetStatus.mockReturnValue({ ...stopped, state: 'pairing', pairing: { url: 'u', code: 'C' } });
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(body.state).toBe('pairing');
    expect(body.pairing).toEqual({ url: 'u', code: 'C' });
  });
});
