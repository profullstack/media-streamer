/**
 * Torrent Comments API Route Tests
 *
 * Tests for GET /api/torrents/:id/comments and POST /api/torrents/:id/comments
 *
 * The route accepts either a bt_torrents UUID or a 40-char infohash and keys
 * comments on the infohash, so DHT and indexed torrents both support comments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// Mock the comments service
vi.mock('@/lib/comments', () => ({
  getCommentsService: vi.fn(function() {
    return {
      getCommentsWithUserVotes: vi.fn(),
      createComment: vi.fn(),
      getCommentCount: vi.fn(),
    };
  }),
}));

// Mock the auth helper
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

// Mock the profile utils
vi.mock('@/lib/profiles/profile-utils', () => ({
  getActiveProfileId: vi.fn(),
}));

// Mock the torrent lookups used to resolve :id and link indexed torrents
vi.mock('@/lib/supabase/queries', () => ({
  getTorrentById: vi.fn(),
  getTorrentByInfohash: vi.fn(),
}));

import { getCommentsService } from '@/lib/comments';
import { getAuthenticatedUser } from '@/lib/auth';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getTorrentById, getTorrentByInfohash } from '@/lib/supabase/queries';

const TEST_TORRENT_ID = '12345678-1234-4123-8123-123456789abc';
const TEST_INFOHASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const DHT_INFOHASH = 'ffeeddccbbaa99887766554433221100aabbccdd';
const TEST_USER_ID = '87654321-4321-4321-8321-cba987654321';

/** The indexed torrent that TEST_TORRENT_ID / TEST_INFOHASH both point at */
const INDEXED_TORRENT = { id: TEST_TORRENT_ID, infohash: TEST_INFOHASH };

describe('Torrent Comments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, the UUID resolves to an indexed torrent
    (getTorrentById as ReturnType<typeof vi.fn>).mockResolvedValue(INDEXED_TORRENT);
    (getTorrentByInfohash as ReturnType<typeof vi.fn>).mockResolvedValue(INDEXED_TORRENT);
  });

  describe('GET /api/torrents/:id/comments', () => {
    it('should return comments for a torrent', async () => {
      const mockComments = [
        {
          id: 'comment-1',
          infohash: TEST_INFOHASH,
          torrentId: TEST_TORRENT_ID,
          profileId: 'user-1',
          content: 'Great torrent!',
          parentId: null,
          upvotes: 5,
          downvotes: 1,
          deletedAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          authorName: 'Tester',
          authorAvatarEmoji: null,
          userVote: null,
        },
      ];

      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue(mockComments),
        getCommentCount: vi.fn().mockResolvedValue(1),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`);
      const response = await GET(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0].id).toBe('comment-1');
      expect(data.comments[0].authorName).toBe('Tester');
      expect(data.total).toBe(1);
      // A UUID param is resolved to the torrent's infohash before querying
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(TEST_INFOHASH, null, 50, 0);
    });

    it('should return comments for a DHT torrent addressed by infohash', async () => {
      // No bt_torrents row exists for a DHT-only torrent
      (getTorrentByInfohash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue([]),
        getCommentCount: vi.fn().mockResolvedValue(0),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${DHT_INFOHASH}/comments`);
      const response = await GET(request, { params: Promise.resolve({ id: DHT_INFOHASH }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      // Crucially: not an error, and no "DHT torrents can't be commented on" flag
      expect(data.comments).toEqual([]);
      expect(data.isDhtTorrent).toBeUndefined();
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(DHT_INFOHASH, null, 50, 0);
    });

    it('should normalize an uppercase infohash', async () => {
      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue([]),
        getCommentCount: vi.fn().mockResolvedValue(0),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const upper = DHT_INFOHASH.toUpperCase();
      const request = new NextRequest(`http://localhost/api/torrents/${upper}/comments`);
      const response = await GET(request, { params: Promise.resolve({ id: upper }) });

      expect(response.status).toBe(200);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(DHT_INFOHASH, null, 50, 0);
    });

    it('should include user vote status when authenticated', async () => {
      const mockComments = [
        {
          id: 'comment-1',
          infohash: TEST_INFOHASH,
          torrentId: TEST_TORRENT_ID,
          profileId: 'user-1',
          content: 'Great torrent!',
          parentId: null,
          upvotes: 5,
          downvotes: 1,
          deletedAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          authorName: 'Tester',
          authorAvatarEmoji: null,
          userVote: 1,
        },
      ];

      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue(mockComments),
        getCommentCount: vi.fn().mockResolvedValue(1),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue('profile-123');

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`);
      const response = await GET(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.comments[0].userVote).toBe(1);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(TEST_INFOHASH, 'profile-123', 50, 0);
    });

    it('should support pagination', async () => {
      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue([]),
        getCommentCount: vi.fn().mockResolvedValue(100),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments?limit=10&offset=20`);
      const response = await GET(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(200);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(TEST_INFOHASH, null, 10, 20);
    });

    it('should fall back to safe pagination for malformed params', async () => {
      const mockService = {
        getCommentsWithUserVotes: vi.fn().mockResolvedValue([]),
        getCommentCount: vi.fn().mockResolvedValue(0),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(
        `http://localhost/api/torrents/${TEST_TORRENT_ID}/comments?limit=10items&offset=-20`
      );
      const response = await GET(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(200);
      expect(mockService.getCommentsWithUserVotes).toHaveBeenCalledWith(TEST_INFOHASH, null, 50, 0);
      await expect(response.json()).resolves.toMatchObject({ limit: 50, offset: 0 });
    });

    it('should return 404 when a UUID matches no torrent', async () => {
      (getTorrentById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`);
      const response = await GET(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(404);
    });

    it('should return 400 for missing torrent ID', async () => {
      const request = new NextRequest('http://localhost/api/torrents//comments');
      const response = await GET(request, { params: Promise.resolve({ id: '' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Torrent ID is required');
    });
  });

  describe('POST /api/torrents/:id/comments', () => {
    it('should create a comment when authenticated', async () => {
      const mockComment = {
        id: 'comment-new',
        infohash: TEST_INFOHASH,
        torrentId: TEST_TORRENT_ID,
        profileId: 'profile-123',
        content: 'This is a great torrent!',
        parentId: null,
        upvotes: 0,
        downvotes: 0,
        deletedAt: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        createComment: vi.fn().mockResolvedValue(mockComment),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue('profile-123');

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: 'This is a great torrent!' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.comment.id).toBe('comment-new');
      expect(data.comment.content).toBe('This is a great torrent!');
      expect(mockService.createComment).toHaveBeenCalledWith({
        infohash: TEST_INFOHASH,
        torrentId: TEST_TORRENT_ID,
        profileId: 'profile-123',
        content: 'This is a great torrent!',
        parentId: undefined,
      });
    });

    it('should create a comment on a DHT torrent with no indexed row', async () => {
      (getTorrentByInfohash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const mockService = {
        createComment: vi.fn().mockResolvedValue({
          id: 'comment-dht',
          infohash: DHT_INFOHASH,
          torrentId: null,
          profileId: 'profile-123',
          content: 'Works on DHT too',
          parentId: null,
          upvotes: 0,
          downvotes: 0,
          deletedAt: null,
          createdAt: new Date('2026-01-02T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        }),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue('profile-123');

      const request = new NextRequest(`http://localhost/api/torrents/${DHT_INFOHASH}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: 'Works on DHT too' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: DHT_INFOHASH }) });

      expect(response.status).toBe(201);
      expect(mockService.createComment).toHaveBeenCalledWith({
        infohash: DHT_INFOHASH,
        torrentId: null,
        profileId: 'profile-123',
        content: 'Works on DHT too',
        parentId: undefined,
      });
    });

    it('should create a reply to an existing comment', async () => {
      const mockComment = {
        id: 'comment-reply',
        infohash: TEST_INFOHASH,
        torrentId: TEST_TORRENT_ID,
        profileId: 'profile-123',
        content: 'I agree!',
        parentId: 'comment-parent',
        upvotes: 0,
        downvotes: 0,
        deletedAt: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const mockService = {
        createComment: vi.fn().mockResolvedValue(mockComment),
      };

      (getCommentsService as ReturnType<typeof vi.fn>).mockReturnValue(mockService);
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue('profile-123');

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: 'I agree!', parentId: 'comment-parent' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.comment.parentId).toBe('comment-parent');
    });

    it('should return 401 when not authenticated', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: 'Test comment' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when no profile is selected', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: 'Test comment' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Select a profile before commenting');
    });

    it('should return 400 for empty content', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });
      (getActiveProfileId as ReturnType<typeof vi.fn>).mockResolvedValue('profile-123');

      const request = new NextRequest(`http://localhost/api/torrents/${TEST_TORRENT_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: TEST_TORRENT_ID }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Comment content is required');
    });

    it('should return 400 for missing torrent ID', async () => {
      (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TEST_USER_ID });

      const request = new NextRequest('http://localhost/api/torrents//comments', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test comment' }),
      });

      const response = await POST(request, { params: Promise.resolve({ id: '' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Torrent ID is required');
    });
  });
});
