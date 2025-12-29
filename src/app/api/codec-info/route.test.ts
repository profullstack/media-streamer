/**
 * Codec Info API Route Tests
 * 
 * Tests for the /api/codec-info endpoint that detects and stores codec information.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the codec detection module
vi.mock('@/lib/codec-detection', () => ({
  detectCodecFromUrl: vi.fn(),
  formatCodecInfoForDb: vi.fn(),
  needsTranscoding: vi.fn(),
}));

// Create a more complete mock for Supabase with flexible return types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSingleTorrent = vi.fn().mockResolvedValue({ data: { id: 'torrent-123' }, error: null }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSingleFile = vi.fn().mockResolvedValue({ data: { id: 'file-123', media_category: 'video' }, error: null }) as any;

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'torrents') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockSingleTorrent,
            })),
          })),
        };
      }
      if (table === 'torrent_files') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: mockSingleFile,
              })),
            })),
          })),
        };
      }
      if (table === 'video_metadata' || table === 'audio_metadata') {
        return {
          upsert: mockUpsert,
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    }),
  })),
}));

describe('/api/codec-info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockSingleTorrent.mockResolvedValue({ data: { id: 'torrent-123' }, error: null });
    mockSingleFile.mockResolvedValue({ data: { id: 'file-123', media_category: 'video' }, error: null });
  });

  describe('GET', () => {
    it('should return 400 if infohash is missing', async () => {
      const { GET } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info');
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required parameter: infohash');
    });

    it('should return 400 if fileIndex is missing', async () => {
      const { GET } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info?infohash=abc123');
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required parameter: fileIndex');
    });

    it('should return 400 if fileIndex is not a number', async () => {
      const { GET } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info?infohash=abc123&fileIndex=invalid');
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('fileIndex must be a valid number');
    });

    it('should detect codec and return info', async () => {
      const { detectCodecFromUrl } = await import('@/lib/codec-detection');
      const mockDetect = detectCodecFromUrl as ReturnType<typeof vi.fn>;

      mockDetect.mockResolvedValue({
        videoCodec: 'hevc',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 120.5,
        bitRate: 5000000,
        needsTranscoding: true,
        streams: [],
      });

      const { GET } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info?infohash=abc123&fileIndex=0');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.videoCodec).toBe('hevc');
      expect(data.audioCodec).toBe('aac');
      expect(data.needsTranscoding).toBe(true);
    });
  });

  describe('POST', () => {
    it('should return 400 if body is missing', async () => {
      const { POST } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info', {
        method: 'POST',
        body: null,
      });
      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it('should return 400 if infohash is missing in body', async () => {
      const { POST } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info', {
        method: 'POST',
        body: JSON.stringify({ fileIndex: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required field: infohash');
    });

    it('should detect codec and update database', async () => {
      const { detectCodecFromUrl, formatCodecInfoForDb } = await import('@/lib/codec-detection');
      const mockDetect = detectCodecFromUrl as ReturnType<typeof vi.fn>;
      const mockFormat = formatCodecInfoForDb as ReturnType<typeof vi.fn>;

      mockDetect.mockResolvedValue({
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 120.5,
        bitRate: 5000000,
        needsTranscoding: false,
        streams: [],
      });

      mockFormat.mockReturnValue({
        video_codec: 'h264',
        audio_codec: 'aac',
        container: 'mp4',
        duration_seconds: 120.5,
        bit_rate: 5000000,
        needs_transcoding: false,
        resolution: '1920x1080',
      });

      const { POST } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info', {
        method: 'POST',
        body: JSON.stringify({ infohash: 'abc123', fileIndex: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.videoCodec).toBe('h264');
      expect(data.needsTranscoding).toBe(false);
      expect(data.saved).toBe(true);
    });

    it('should return 404 if torrent not found', async () => {
      const { detectCodecFromUrl, formatCodecInfoForDb } = await import('@/lib/codec-detection');
      const mockDetect = detectCodecFromUrl as ReturnType<typeof vi.fn>;
      const mockFormat = formatCodecInfoForDb as ReturnType<typeof vi.fn>;

      mockDetect.mockResolvedValue({
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 120.5,
        bitRate: 5000000,
        needsTranscoding: false,
        streams: [],
      });

      mockFormat.mockReturnValue({
        video_codec: 'h264',
        audio_codec: 'aac',
        container: 'mp4',
        duration_seconds: 120.5,
        bit_rate: 5000000,
        needs_transcoding: false,
        resolution: '1920x1080',
      });

      // Mock torrent not found - error should be null when data is null (PGRST116 case)
      mockSingleTorrent.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } });

      const { POST } = await import('./route.js');
      
      const request = new NextRequest('http://localhost:3000/api/codec-info', {
        method: 'POST',
        body: JSON.stringify({ infohash: 'nonexistent', fileIndex: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Torrent not found');
    });
  });
});
