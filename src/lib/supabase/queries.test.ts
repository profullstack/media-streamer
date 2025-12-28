import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TorrentInsert, TorrentFileInsert, AudioMetadataInsert, VideoMetadataInsert, EbookMetadataInsert } from './types';

// Mock the Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('./client', () => ({
  getServerClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Import after mocking
import {
  getTorrentByInfohash,
  createTorrent,
  getTorrentFiles,
  createTorrentFiles,
  getAudioMetadata,
  createAudioMetadata,
  getVideoMetadata,
  createVideoMetadata,
  getEbookMetadata,
  createEbookMetadata,
  searchFiles,
  deleteTorrent,
  updateTorrentSwarmStats,
} from './queries';

describe('Supabase Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock chain
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    });
    
    mockSelect.mockReturnValue({
      eq: mockEq,
      single: mockSingle,
    });
    
    mockInsert.mockReturnValue({
      select: mockSelect,
      single: mockSingle,
    });
    
    mockUpdate.mockReturnValue({
      eq: mockEq,
    });
    
    mockDelete.mockReturnValue({
      eq: mockEq,
    });
    
    mockEq.mockReturnValue({
      single: mockSingle,
      eq: mockEq,
      select: mockSelect,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getTorrentByInfohash', () => {
    it('should return torrent when found', async () => {
      const mockTorrent = {
        id: '123',
        infohash: 'abc123',
        magnet_uri: 'magnet:?xt=urn:btih:abc123',
        name: 'Test Torrent',
        total_size: 1000000,
        file_count: 5,
        piece_length: 16384,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockTorrent, error: null });

      const result = await getTorrentByInfohash('abc123');

      expect(mockFrom).toHaveBeenCalledWith('torrents');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('infohash', 'abc123');
      expect(result).toEqual(mockTorrent);
    });

    it('should return null when torrent not found', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const result = await getTorrentByInfohash('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on database error', async () => {
      mockSingle.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error', code: 'OTHER' } 
      });

      await expect(getTorrentByInfohash('abc123')).rejects.toThrow('Database error');
    });
  });

  describe('createTorrent', () => {
    it('should create and return new torrent', async () => {
      const torrentData: TorrentInsert = {
        infohash: 'abc123',
        magnet_uri: 'magnet:?xt=urn:btih:abc123',
        name: 'Test Torrent',
        total_size: 1000000,
        file_count: 5,
        piece_length: 16384,
      };

      const mockCreatedTorrent = {
        id: '123',
        ...torrentData,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockCreatedTorrent, error: null });

      const result = await createTorrent(torrentData);

      expect(mockFrom).toHaveBeenCalledWith('torrents');
      expect(mockInsert).toHaveBeenCalledWith(torrentData);
      expect(result).toEqual(mockCreatedTorrent);
    });

    it('should throw error on duplicate infohash', async () => {
      const torrentData: TorrentInsert = {
        infohash: 'abc123',
        magnet_uri: 'magnet:?xt=urn:btih:abc123',
        name: 'Test Torrent',
        total_size: 1000000,
        file_count: 5,
        piece_length: 16384,
      };

      mockSingle.mockResolvedValue({ 
        data: null, 
        error: { message: 'duplicate key value', code: '23505' } 
      });

      await expect(createTorrent(torrentData)).rejects.toThrow('duplicate key value');
    });
  });

  describe('getTorrentFiles', () => {
    it('should return files for a torrent', async () => {
      const mockFiles = [
        { id: '1', torrent_id: '123', name: 'file1.mp3', path: '/music/file1.mp3' },
        { id: '2', torrent_id: '123', name: 'file2.mp3', path: '/music/file2.mp3' },
      ];

      mockEq.mockResolvedValue({ data: mockFiles, error: null });

      const result = await getTorrentFiles('123');

      expect(mockFrom).toHaveBeenCalledWith('torrent_files');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('torrent_id', '123');
      expect(result).toEqual(mockFiles);
    });

    it('should return empty array when no files found', async () => {
      mockEq.mockResolvedValue({ data: [], error: null });

      const result = await getTorrentFiles('123');

      expect(result).toEqual([]);
    });
  });

  describe('createTorrentFiles', () => {
    it('should create multiple files', async () => {
      const filesData: TorrentFileInsert[] = [
        {
          torrent_id: '123',
          file_index: 0,
          path: '/music/file1.mp3',
          name: 'file1.mp3',
          size: 5000000,
          piece_start: 0,
          piece_end: 100,
          media_category: 'audio',
        },
        {
          torrent_id: '123',
          file_index: 1,
          path: '/music/file2.mp3',
          name: 'file2.mp3',
          size: 6000000,
          piece_start: 100,
          piece_end: 200,
          media_category: 'audio',
        },
      ];

      const mockCreatedFiles = filesData.map((f, i) => ({
        id: `file-${i}`,
        ...f,
        created_at: '2024-01-01T00:00:00Z',
      }));

      mockSelect.mockResolvedValue({ data: mockCreatedFiles, error: null });

      const result = await createTorrentFiles(filesData);

      expect(mockFrom).toHaveBeenCalledWith('torrent_files');
      expect(mockInsert).toHaveBeenCalledWith(filesData);
      expect(result).toEqual(mockCreatedFiles);
    });
  });

  describe('getAudioMetadata', () => {
    it('should return audio metadata for a file', async () => {
      const mockMetadata = {
        id: 'meta-1',
        file_id: 'file-1',
        artist: 'Test Artist',
        album: 'Test Album',
        title: 'Test Track',
        track_number: 1,
        duration_seconds: 180,
      };

      mockSingle.mockResolvedValue({ data: mockMetadata, error: null });

      const result = await getAudioMetadata('file-1');

      expect(mockFrom).toHaveBeenCalledWith('audio_metadata');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('file_id', 'file-1');
      expect(result).toEqual(mockMetadata);
    });

    it('should return null when no metadata found', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const result = await getAudioMetadata('file-1');

      expect(result).toBeNull();
    });
  });

  describe('createAudioMetadata', () => {
    it('should create audio metadata', async () => {
      const metadataData: AudioMetadataInsert = {
        file_id: 'file-1',
        artist: 'Test Artist',
        album: 'Test Album',
        title: 'Test Track',
        track_number: 1,
        duration_seconds: 180,
        bitrate: 320,
        sample_rate: 44100,
        genre: 'Electronic',
        year: 2024,
      };

      const mockCreatedMetadata = {
        id: 'meta-1',
        ...metadataData,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockCreatedMetadata, error: null });

      const result = await createAudioMetadata(metadataData);

      expect(mockFrom).toHaveBeenCalledWith('audio_metadata');
      expect(mockInsert).toHaveBeenCalledWith(metadataData);
      expect(result).toEqual(mockCreatedMetadata);
    });
  });

  describe('getVideoMetadata', () => {
    it('should return video metadata for a file', async () => {
      const mockMetadata = {
        id: 'meta-1',
        file_id: 'file-1',
        title: 'Test Video',
        duration_seconds: 7200,
        width: 1920,
        height: 1080,
        codec: 'h264',
      };

      mockSingle.mockResolvedValue({ data: mockMetadata, error: null });

      const result = await getVideoMetadata('file-1');

      expect(mockFrom).toHaveBeenCalledWith('video_metadata');
      expect(result).toEqual(mockMetadata);
    });
  });

  describe('createVideoMetadata', () => {
    it('should create video metadata', async () => {
      const metadataData: VideoMetadataInsert = {
        file_id: 'file-1',
        title: 'Test Video',
        duration_seconds: 7200,
        width: 1920,
        height: 1080,
        codec: 'h264',
        bitrate: 8000000,
        framerate: 24,
      };

      const mockCreatedMetadata = {
        id: 'meta-1',
        ...metadataData,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockCreatedMetadata, error: null });

      const result = await createVideoMetadata(metadataData);

      expect(mockFrom).toHaveBeenCalledWith('video_metadata');
      expect(result).toEqual(mockCreatedMetadata);
    });
  });

  describe('getEbookMetadata', () => {
    it('should return ebook metadata for a file', async () => {
      const mockMetadata = {
        id: 'meta-1',
        file_id: 'file-1',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        isbn: '978-0-123456-78-9',
        page_count: 300,
      };

      mockSingle.mockResolvedValue({ data: mockMetadata, error: null });

      const result = await getEbookMetadata('file-1');

      expect(mockFrom).toHaveBeenCalledWith('ebook_metadata');
      expect(result).toEqual(mockMetadata);
    });
  });

  describe('createEbookMetadata', () => {
    it('should create ebook metadata', async () => {
      const metadataData: EbookMetadataInsert = {
        file_id: 'file-1',
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        isbn: '978-0-123456-78-9',
        language: 'en',
        page_count: 300,
        year: 2024,
      };

      const mockCreatedMetadata = {
        id: 'meta-1',
        ...metadataData,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockCreatedMetadata, error: null });

      const result = await createEbookMetadata(metadataData);

      expect(mockFrom).toHaveBeenCalledWith('ebook_metadata');
      expect(result).toEqual(mockCreatedMetadata);
    });
  });

  describe('searchFiles', () => {
    it('should search files with query', async () => {
      const mockResults = [
        {
          file_id: 'file-1',
          file_name: 'aphex_twin_xtal.flac',
          file_path: '/Aphex Twin/Selected Ambient Works/Xtal.flac',
          file_size: 50000000,
          file_media_category: 'audio',
          file_index: 0,
          torrent_id: 'torrent-1',
          torrent_name: 'Music Archive',
          torrent_infohash: 'abc123',
          rank: 0.9,
        },
      ];

      mockRpc.mockResolvedValue({ data: mockResults, error: null });

      const result = await searchFiles({ query: 'Aphex Twin' });

      expect(mockRpc).toHaveBeenCalledWith('search_files', {
        search_query: 'Aphex Twin',
        media_type: null,
        torrent_uuid: null,
        result_limit: 50,
        result_offset: 0,
      });
      expect(result).toEqual(mockResults);
    });

    it('should search with media type filter', async () => {
      const mockResults: unknown[] = [];
      mockRpc.mockResolvedValue({ data: mockResults, error: null });

      await searchFiles({ query: 'test', mediaType: 'audio' });

      expect(mockRpc).toHaveBeenCalledWith('search_files', {
        search_query: 'test',
        media_type: 'audio',
        torrent_uuid: null,
        result_limit: 50,
        result_offset: 0,
      });
    });

    it('should search within specific torrent', async () => {
      const mockResults: unknown[] = [];
      mockRpc.mockResolvedValue({ data: mockResults, error: null });

      await searchFiles({ query: 'test', torrentId: 'torrent-123' });

      expect(mockRpc).toHaveBeenCalledWith('search_files', {
        search_query: 'test',
        media_type: null,
        torrent_uuid: 'torrent-123',
        result_limit: 50,
        result_offset: 0,
      });
    });

    it('should support pagination', async () => {
      const mockResults: unknown[] = [];
      mockRpc.mockResolvedValue({ data: mockResults, error: null });

      await searchFiles({ query: 'test', limit: 20, offset: 40 });

      expect(mockRpc).toHaveBeenCalledWith('search_files', {
        search_query: 'test',
        media_type: null,
        torrent_uuid: null,
        result_limit: 20,
        result_offset: 40,
      });
    });

    it('should throw error on search failure', async () => {
      mockRpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Search failed' } 
      });

      await expect(searchFiles({ query: 'test' })).rejects.toThrow('Search failed');
    });
  });

  describe('deleteTorrent', () => {
    it('should delete torrent by id', async () => {
      mockEq.mockResolvedValue({ data: null, error: null });

      await deleteTorrent('torrent-123');

      expect(mockFrom).toHaveBeenCalledWith('torrents');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'torrent-123');
    });

    it('should throw error on delete failure', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { message: 'Delete failed' }
      });

      await expect(deleteTorrent('torrent-123')).rejects.toThrow('Delete failed');
    });
  });

  describe('updateTorrentSwarmStats', () => {
    it('should update swarm stats for a torrent', async () => {
      const mockUpdatedTorrent = {
        id: 'torrent-123',
        infohash: 'abc123',
        seeders: 100,
        leechers: 50,
        swarm_updated_at: '2024-01-01T12:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockUpdatedTorrent, error: null });

      const result = await updateTorrentSwarmStats('torrent-123', {
        seeders: 100,
        leechers: 50,
      });

      expect(mockFrom).toHaveBeenCalledWith('torrents');
      expect(mockUpdate).toHaveBeenCalledWith({
        seeders: 100,
        leechers: 50,
        swarm_updated_at: expect.any(String),
      });
      expect(mockEq).toHaveBeenCalledWith('id', 'torrent-123');
      expect(result).toEqual(mockUpdatedTorrent);
    });

    it('should update only seeders when leechers is null', async () => {
      const mockUpdatedTorrent = {
        id: 'torrent-123',
        seeders: 100,
        leechers: null,
        swarm_updated_at: '2024-01-01T12:00:00Z',
      };

      mockSingle.mockResolvedValue({ data: mockUpdatedTorrent, error: null });

      const result = await updateTorrentSwarmStats('torrent-123', {
        seeders: 100,
        leechers: null,
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        seeders: 100,
        leechers: null,
        swarm_updated_at: expect.any(String),
      });
      expect(result).toEqual(mockUpdatedTorrent);
    });

    it('should throw error on update failure', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' }
      });

      await expect(updateTorrentSwarmStats('torrent-123', {
        seeders: 100,
        leechers: 50,
      })).rejects.toThrow('Update failed');
    });
  });
});
