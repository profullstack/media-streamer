/**
 * IPTV Playlists API Route Tests
 * 
 * Tests for POST /api/iptv/playlists endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('POST /api/iptv/playlists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when name is missing', async () => {
    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required field: name');
  });

  it('should return 400 when m3uUrl is missing', async () => {
    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required field: m3uUrl');
  });

  it('should return 400 when m3uUrl is invalid', async () => {
    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'not-a-valid-url',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid m3uUrl: must be a valid HTTP or HTTPS URL');
  });

  it('should return 400 when epgUrl is provided but invalid', async () => {
    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
        epgUrl: 'not-a-valid-url',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid epgUrl: must be a valid HTTP or HTTPS URL');
  });

  it('should return 502 when M3U URL is not accessible', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Failed to validate M3U URL: 404 Not Found');
  });

  it('should return 504 when M3U URL request times out', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(504);
    expect(data.error).toBe('Request timeout while validating M3U URL');
  });

  it('should return 502 when M3U URL fetch fails with network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Failed to validate M3U URL');
  });

  it('should return 200 with playlist data on success (200 OK)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('My Playlist');
    expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe('string');
    expect(data.epgUrl).toBeUndefined();
  });

  it('should return 200 with playlist data on success (206 Partial Content)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, // 206 is not considered "ok" by fetch
      status: 206,
    });

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('My Playlist');
    expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
    expect(data.id).toBeDefined();
  });

  it('should return 200 with playlist data including epgUrl on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
        epgUrl: 'http://example.com/epg.xml',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('My Playlist');
    expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
    expect(data.epgUrl).toBe('http://example.com/epg.xml');
    expect(data.id).toBeDefined();
  });

  it('should trim whitespace from name and URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '  My Playlist  ',
        m3uUrl: '  http://example.com/playlist.m3u  ',
        epgUrl: '  http://example.com/epg.xml  ',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('My Playlist');
    expect(data.m3uUrl).toBe('http://example.com/playlist.m3u');
    expect(data.epgUrl).toBe('http://example.com/epg.xml');
  });

  it('should return 400 when request body is invalid JSON', async () => {
    const request = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('should generate unique IDs for each playlist', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const request1 = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Playlist 1',
        m3uUrl: 'http://example.com/playlist1.m3u',
      }),
    });

    const request2 = new NextRequest('http://localhost/api/iptv/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Playlist 2',
        m3uUrl: 'http://example.com/playlist2.m3u',
      }),
    });

    const response1 = await POST(request1);
    const data1 = await response1.json();

    const response2 = await POST(request2);
    const data2 = await response2.json();

    expect(data1.id).not.toBe(data2.id);
  });
});
