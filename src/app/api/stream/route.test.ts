import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'user-123', email: 'test@example.com' })),
}));

// Mock subscription
const mockSubscriptionRepository = {
  getSubscription: vi.fn().mockResolvedValue({
    id: 'sub-123',
    user_id: 'user-123',
    tier: 'premium',
    status: 'active',
    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_expires_at: null,
  }),
};

vi.mock('@/lib/subscription', () => ({
  getSubscriptionRepository: vi.fn(() => mockSubscriptionRepository),
}));

// Mock the streaming service - must be before imports
const mockCreateStream = vi.fn();
const mockGetStreamInfo = vi.fn();
const mockCloseStream = vi.fn();
const mockGetActiveStreamCount = vi.fn();

vi.mock('@/lib/streaming', () => {
  // Define error classes inside the factory function
  class StreamingError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StreamingError';
    }
  }

  class FileNotFoundError extends StreamingError {
    constructor(message: string) {
      super(message);
      this.name = 'FileNotFoundError';
    }
  }

  class RangeNotSatisfiableError extends StreamingError {
    constructor(message: string) {
      super(message);
      this.name = 'RangeNotSatisfiableError';
    }
  }

  return {
    StreamingService: vi.fn(() => ({
      createStream: mockCreateStream,
      getStreamInfo: mockGetStreamInfo,
      closeStream: mockCloseStream,
      getActiveStreamCount: mockGetActiveStreamCount,
    })),
    StreamingError,
    FileNotFoundError,
    RangeNotSatisfiableError,
  };
});

// Import after mocking
import { GET, HEAD } from './route';

// Helper to create error instances
async function createStreamingError(message: string): Promise<Error> {
  const { StreamingError } = await import('@/lib/streaming');
  return new StreamingError(message);
}

async function createFileNotFoundError(message: string): Promise<Error> {
  const { FileNotFoundError } = await import('@/lib/streaming');
  return new FileNotFoundError(message);
}

async function createRangeNotSatisfiableError(message: string): Promise<Error> {
  const { RangeNotSatisfiableError } = await import('@/lib/streaming');
  return new RangeNotSatisfiableError(message);
}

describe('Stream API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/stream', () => {
    it('should return 400 if infohash is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream?fileIndex=0');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required parameter: infohash');
    });

    it('should return 400 if fileIndex is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required parameter: fileIndex');
    });

    it('should return 400 if fileIndex is not a number', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=abc'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('fileIndex must be a non-negative integer');
    });

    it('should return 400 if fileIndex is negative', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=-1'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('fileIndex must be a non-negative integer');
    });

    it('should stream a file successfully', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('test data')), 10);
          }
          if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockCreateStream.mockResolvedValue({
        streamId: 'test-stream-id',
        stream: mockStream,
        mimeType: 'audio/mpeg',
        size: 1000,
        isPartial: false,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
      expect(response.headers.get('Content-Length')).toBe('1000');
      expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    });

    it('should handle range requests', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('partial data')), 10);
          }
          if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockGetStreamInfo.mockResolvedValue({
        fileName: 'video.mp4',
        filePath: 'Movies/video.mp4',
        size: 10000,
        mimeType: 'video/mp4',
        mediaCategory: 'video',
      });

      mockCreateStream.mockResolvedValue({
        streamId: 'test-stream-id',
        stream: mockStream,
        mimeType: 'video/mp4',
        size: 10000,
        isPartial: true,
        contentRange: 'bytes 0-999/10000',
        contentLength: 1000,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0',
        {
          headers: {
            Range: 'bytes=0-999',
          },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(206);
      expect(response.headers.get('Content-Range')).toBe('bytes 0-999/10000');
      expect(response.headers.get('Content-Length')).toBe('1000');
    });

    it('should return 404 for file not found', async () => {
      const error = await createFileNotFoundError('File not found');
      mockCreateStream.mockRejectedValue(error);

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=99'
      );
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('File not found');
    });

    it('should return 416 for invalid range', async () => {
      mockGetStreamInfo.mockResolvedValue({
        fileName: 'video.mp4',
        filePath: 'Movies/video.mp4',
        size: 1000,
        mimeType: 'video/mp4',
        mediaCategory: 'video',
      });

      const error = await createRangeNotSatisfiableError('Range not satisfiable');
      mockCreateStream.mockRejectedValue(error);

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0',
        {
          headers: {
            Range: 'bytes=99999-100000',
          },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(416);
      const data = await response.json();
      expect(data.error).toContain('Range not satisfiable');
    });

    it('should return 500 for streaming errors', async () => {
      const error = await createStreamingError('Streaming failed');
      mockCreateStream.mockRejectedValue(error);

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0'
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Streaming failed');
    });
  });

  describe('HEAD /api/stream', () => {
    it('should return file info without body', async () => {
      mockGetStreamInfo.mockResolvedValue({
        fileName: 'song.mp3',
        filePath: 'Album/song.mp3',
        size: 5000000,
        mimeType: 'audio/mpeg',
        mediaCategory: 'audio',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0'
      );
      const response = await HEAD(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
      expect(response.headers.get('Content-Length')).toBe('5000000');
      expect(response.headers.get('Accept-Ranges')).toBe('bytes');
      expect(response.headers.get('X-Media-Category')).toBe('audio');
    });

    it('should return 400 if parameters are missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream');
      const response = await HEAD(request);

      expect(response.status).toBe(400);
    });

    it('should return 404 for file not found', async () => {
      const error = await createFileNotFoundError('File not found');
      mockGetStreamInfo.mockRejectedValue(error);

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=99'
      );
      const response = await HEAD(request);

      expect(response.status).toBe(404);
    });
  });

  describe('Range header parsing', () => {
    it('should parse simple range header', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('data')), 10);
          }
          if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockGetStreamInfo.mockResolvedValue({
        fileName: 'song.mp3',
        filePath: 'Album/song.mp3',
        size: 10000,
        mimeType: 'audio/mpeg',
        mediaCategory: 'audio',
      });

      mockCreateStream.mockResolvedValue({
        streamId: 'test-stream-id',
        stream: mockStream,
        mimeType: 'audio/mpeg',
        size: 10000,
        isPartial: true,
        contentRange: 'bytes 100-199/10000',
        contentLength: 100,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0',
        {
          headers: {
            Range: 'bytes=100-199',
          },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(206);
      expect(mockCreateStream).toHaveBeenCalledWith(
        expect.objectContaining({
          range: { start: 100, end: 199 },
        })
      );
    });

    it('should handle range with only start', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('data')), 10);
          }
          if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
          return mockStream;
        }),
        destroy: vi.fn(),
      };

      mockGetStreamInfo.mockResolvedValue({
        fileName: 'song.mp3',
        filePath: 'Album/song.mp3',
        size: 10000,
        mimeType: 'audio/mpeg',
        mediaCategory: 'audio',
      });

      mockCreateStream.mockResolvedValue({
        streamId: 'test-stream-id',
        stream: mockStream,
        mimeType: 'audio/mpeg',
        size: 10000,
        isPartial: true,
        contentRange: 'bytes 500-9999/10000',
        contentLength: 9500,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stream?infohash=1234567890abcdef1234567890abcdef12345678&fileIndex=0',
        {
          headers: {
            Range: 'bytes=500-',
          },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(206);
    });
  });
});
