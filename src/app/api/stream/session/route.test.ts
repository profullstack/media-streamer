/**
 * Stream Session API Tests
 * 
 * Tests for the stream session management API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET, DELETE } from './route';
import { clearAllSessions } from '@/lib/stream-from-search';

describe('Stream Session API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe('POST /api/stream/session', () => {
    it('should create a new stream session', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.sessionId).toBeDefined();
      expect(data.status).toBe('initializing');
    });

    it('should return 400 for missing torrentId', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          filePath: '/Music/track.mp3',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('torrentId is required');
    });

    it('should return 400 for missing filePath', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('filePath is required');
    });

    it('should return 400 for missing infohash', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('infohash is required');
    });

    it('should return 400 for invalid infohash', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
          infohash: 'invalid',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid infohash');
    });

    it('should return 400 for path traversal attempt', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '../../../etc/passwd',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid file path');
    });

    it('should return 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });
  });

  describe('GET /api/stream/session', () => {
    it('should get an existing session', async () => {
      // First create a session
      const createRequest = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const createResponse = await POST(createRequest);
      const createData = await createResponse.json();

      // Then get the session
      const getRequest = new NextRequest(
        `http://localhost:3000/api/stream/session?sessionId=${createData.sessionId}`,
        { method: 'GET' }
      );

      const response = await GET(getRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe(createData.sessionId);
      expect(data.torrentId).toBe('torrent-123');
      expect(data.filePath).toBe('/Music/track.mp3');
    });

    it('should return 400 for missing sessionId', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('sessionId is required');
    });

    it('should return 404 for non-existent session', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/stream/session?sessionId=non-existent',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Session not found');
    });
  });

  describe('DELETE /api/stream/session', () => {
    it('should delete an existing session', async () => {
      // First create a session
      const createRequest = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'POST',
        body: JSON.stringify({
          torrentId: 'torrent-123',
          filePath: '/Music/track.mp3',
          infohash: 'a'.repeat(40),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const createResponse = await POST(createRequest);
      const createData = await createResponse.json();

      // Then delete the session
      const deleteRequest = new NextRequest(
        `http://localhost:3000/api/stream/session?sessionId=${createData.sessionId}`,
        { method: 'DELETE' }
      );

      const response = await DELETE(deleteRequest);

      expect(response.status).toBe(204);

      // Verify session is deleted
      const getRequest = new NextRequest(
        `http://localhost:3000/api/stream/session?sessionId=${createData.sessionId}`,
        { method: 'GET' }
      );

      const getResponse = await GET(getRequest);
      expect(getResponse.status).toBe(404);
    });

    it('should return 400 for missing sessionId', async () => {
      const request = new NextRequest('http://localhost:3000/api/stream/session', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('sessionId is required');
    });

    it('should return 204 for non-existent session (idempotent)', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/stream/session?sessionId=non-existent',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);

      // DELETE should be idempotent
      expect(response.status).toBe(204);
    });
  });
});
