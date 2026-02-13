/**
 * Playlist Auto-Save Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getServerClient
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockLike = vi.fn();

vi.mock('../supabase/client', () => ({
  getServerClient: () => ({
    from: mockFrom,
  }),
}));

import { generatePlaylistName, autoSavePlaylist } from './playlist-auto-save';

describe('playlist-auto-save', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain for select queries
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ like: mockLike });
    mockInsert.mockResolvedValue({ error: null });
  });

  describe('generatePlaylistName', () => {
    it('should return "IPTV Subscription" when no playlists exist', async () => {
      mockLike.mockResolvedValue({ data: [] });

      const name = await generatePlaylistName('user-1');
      expect(name).toBe('IPTV Subscription');
    });

    it('should return "IPTV Subscription" when no matching playlists exist', async () => {
      mockLike.mockResolvedValue({ data: null });

      const name = await generatePlaylistName('user-1');
      expect(name).toBe('IPTV Subscription');
    });

    it('should return "IPTV Subscription 2" when base name exists', async () => {
      mockLike.mockResolvedValue({
        data: [{ name: 'IPTV Subscription' }],
      });

      const name = await generatePlaylistName('user-1');
      expect(name).toBe('IPTV Subscription 2');
    });

    it('should return max+1 suffix when gaps exist', async () => {
      mockLike.mockResolvedValue({
        data: [
          { name: 'IPTV Subscription' },
          { name: 'IPTV Subscription 3' },
        ],
      });

      const name = await generatePlaylistName('user-1');
      expect(name).toBe('IPTV Subscription 4');
    });

    it('should handle sequential numbering', async () => {
      mockLike.mockResolvedValue({
        data: [
          { name: 'IPTV Subscription' },
          { name: 'IPTV Subscription 2' },
          { name: 'IPTV Subscription 3' },
        ],
      });

      const name = await generatePlaylistName('user-1');
      expect(name).toBe('IPTV Subscription 4');
    });
  });

  describe('autoSavePlaylist', () => {
    it('should insert playlist with correct m3u_url', async () => {
      mockLike.mockResolvedValue({ data: [] });
      mockInsert.mockResolvedValue({ error: null });

      await autoSavePlaylist('user-1', 'https://example.com/playlist.m3u');

      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-1',
        name: 'IPTV Subscription',
        m3u_url: 'https://example.com/playlist.m3u',
        epg_url: null,
        is_active: true,
      });
    });

    it('should throw on insert error', async () => {
      mockLike.mockResolvedValue({ data: [] });
      mockInsert.mockResolvedValue({ error: { message: 'DB error' } });

      await expect(
        autoSavePlaylist('user-1', 'https://example.com/playlist.m3u')
      ).rejects.toThrow('Failed to auto-save playlist: DB error');
    });
  });
});
