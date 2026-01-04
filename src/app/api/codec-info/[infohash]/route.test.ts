/**
 * Codec Info Dynamic Route Tests
 * 
 * Tests for /api/codec-info/[infohash]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

// Mock the codec-detection module
vi.mock('@/lib/codec-detection', () => ({
  detectCodecFromUrl: vi.fn(),
  formatCodecInfoForDb: vi.fn(),
}));

import { createServerClient } from '@/lib/supabase';
import { detectCodecFromUrl, formatCodecInfoForDb } from '@/lib/codec-detection';

const mockCreateServerClient = vi.mocked(createServerClient);
const mockDetectCodecFromUrl = vi.mocked(detectCodecFromUrl);
const mockFormatCodecInfoForDb = vi.mocked(formatCodecInfoForDb);

function createRequest(path: string, method = 'GET', body?: unknown): NextRequest {
  const url = new URL(`http://localhost${path}`);
  if (body) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new NextRequest(url, { method });
}

function createParams(infohash: string): { params: Promise<{ infohash: string }> } {
  return { params: Promise.resolve({ infohash }) };
}

describe('Codec Info Dynamic Route', () => {
  const validInfohash = 'a'.repeat(40);
  const mockTorrentId = 'torrent-uuid-123';
  const mockFileId = 'file-uuid-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/codec-info/[infohash]', () => {
    it('should return 400 for invalid infohash', async () => {
      const request = createRequest('/api/codec-info/invalid');
      const response = await GET(request, createParams('invalid'));
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid infohash');
    });

    it('should return 404 if torrent not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Torrent not found');
    });

    it('should return cached torrent-level codec info', async () => {
      const mockTorrent = {
        id: mockTorrentId,
        video_codec: 'h264',
        audio_codec: 'aac',
        container: 'mp4',
        needs_transcoding: false,
        codec_detected_at: '2024-01-01T00:00:00Z',
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(true);
      expect(data.videoCodec).toBe('h264');
      expect(data.audioCodec).toBe('aac');
      expect(data.container).toBe('mp4');
      expect(data.needsTranscoding).toBe(false);
    });

    it('should return uncached status when no codec info detected', async () => {
      const mockTorrent = {
        id: mockTorrentId,
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(false);
      expect(data.message).toContain('not detected yet');
    });

    it('should return 400 for invalid fileIndex', async () => {
      const mockTorrent = {
        id: mockTorrentId,
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}?fileIndex=abc`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('fileIndex must be a valid number');
    });

    it('should return 404 if file not found', async () => {
      const mockTorrent = {
        id: mockTorrentId,
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function(this: { _eqCalls?: number }) {
          this._eqCalls = (this._eqCalls ?? 0) + 1;
          return this;
        }),
        single: vi.fn().mockImplementation(function(this: { _eqCalls?: number }) {
          // First call is for torrent, second is for file
          if ((this._eqCalls ?? 0) <= 1) {
            return Promise.resolve({ data: mockTorrent, error: null });
          }
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}?fileIndex=0`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('File not found');
    });

    it('should return cached video file codec info', async () => {
      const mockTorrent = {
        id: mockTorrentId,
        video_codec: null,
        audio_codec: null,
        container: null,
        needs_transcoding: false,
        codec_detected_at: null,
      };

      const mockFile = {
        id: mockFileId,
        media_category: 'video',
      };

      const mockVideoMeta = {
        codec: 'hevc',
        audio_codec: 'aac',
        container: 'mkv',
        needs_transcoding: true,
        codec_detected_at: '2024-01-01T00:00:00Z',
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'torrents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
            };
          }
          if (table === 'torrent_files') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockFile, error: null }),
            };
          }
          if (table === 'video_metadata') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockVideoMeta, error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}?fileIndex=0`);
      const response = await GET(request, createParams(validInfohash));
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cached).toBe(true);
      expect(data.videoCodec).toBe('hevc');
      expect(data.audioCodec).toBe('aac');
      expect(data.needsTranscoding).toBe(true);
    });
  });

  describe('POST /api/codec-info/[infohash]', () => {
    it('should return 400 for invalid infohash', async () => {
      const request = createRequest('/api/codec-info/invalid', 'POST');
      const response = await POST(request, createParams('invalid'));
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid infohash');
    });

    it('should return 404 if torrent not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`, 'POST');
      const response = await POST(request, createParams(validInfohash));
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Torrent not found');
    });

    it('should return 404 if no media files found', async () => {
      const mockTorrent = { id: mockTorrentId };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'torrents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
            };
          }
          if (table === 'torrent_files') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`, 'POST');
      const response = await POST(request, createParams(validInfohash));
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('No video or audio files found in torrent');
    });

    it('should detect codec and save to database', async () => {
      const mockTorrent = { id: mockTorrentId };
      const mockFile = {
        id: mockFileId,
        file_index: 0,
        media_category: 'video',
      };

      const mockCodecInfo = {
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 3600,
        bitRate: 5000000,
        needsTranscoding: false,
        streams: [],
      };

      const mockDbData = {
        video_codec: 'h264',
        audio_codec: 'aac',
        container: 'mp4',
        duration_seconds: 3600,
        bit_rate: 5000000,
        needs_transcoding: false,
        resolution: '1920x1080',
      };

      mockDetectCodecFromUrl.mockResolvedValue(mockCodecInfo as never);
      mockFormatCodecInfoForDb.mockReturnValue(mockDbData as never);

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'torrents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
              update: vi.fn().mockReturnThis(),
            };
          }
          if (table === 'torrent_files') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [mockFile], error: null }),
            };
          }
          if (table === 'video_metadata') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`, 'POST');
      const response = await POST(request, createParams(validInfohash));
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.videoCodec).toBe('h264');
      expect(data.audioCodec).toBe('aac');
      expect(data.needsTranscoding).toBe(false);
      expect(data.saved).toBe(true);
    });

    it('should handle codec detection errors', async () => {
      const mockTorrent = { id: mockTorrentId };
      const mockFile = {
        id: mockFileId,
        file_index: 0,
        media_category: 'video',
      };

      mockDetectCodecFromUrl.mockRejectedValue(new Error('FFprobe failed'));

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'torrents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
            };
          }
          if (table === 'torrent_files') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [mockFile], error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`, 'POST');
      const response = await POST(request, createParams(validInfohash));
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to detect codec');
      expect(data.details).toBe('FFprobe failed');
    });

    it('should skip non-media files', async () => {
      const mockTorrent = { id: mockTorrentId };
      const mockFile = {
        id: mockFileId,
        media_category: 'document',
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'torrents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockTorrent, error: null }),
            };
          }
          if (table === 'torrent_files') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockFile, error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
      mockCreateServerClient.mockReturnValue(mockSupabase as never);

      const request = createRequest(`/api/codec-info/${validInfohash}`, 'POST', { fileIndex: 0 });
      const response = await POST(request, createParams(validInfohash));
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(true);
      expect(data.message).toContain('not a video or audio file');
    });
  });
});
