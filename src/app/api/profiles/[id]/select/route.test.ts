/**
 * Profile Selection API Route Tests
 * 
 * Tests for profile selection (setting active profile in session)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock the profiles service
vi.mock('@/lib/profiles', () => ({
  getProfilesService: vi.fn(),
}));

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

const mockProfilesService: any = {
  getAccountProfiles: vi.fn(),
};

const mockCookieStore: any = {
  set: vi.fn(),
};

const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
};

const mockProfile1 = {
  id: 'profile-123',
  account_id: 'user-123',
  name: 'Test Profile',
  avatar_url: null,
  avatar_emoji: '😀',
  is_default: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockProfile2 = {
  id: 'profile-456',
  account_id: 'user-123',
  name: 'Second Profile',
  avatar_url: null,
  avatar_emoji: '🎮',
  is_default: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('Profile Selection API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { getProfilesService } = vi.mocked(await import('@/lib/profiles'));
    getProfilesService.mockReturnValue(mockProfilesService);

    const { cookies } = vi.mocked(await import('next/headers'));
    cookies.mockResolvedValue(mockCookieStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/profiles/[id]/select', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 404 when profile not found', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1]);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/nonexistent/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Profile not found or does not belong to you');
    });

    it('should return 404 when profile belongs to different user', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const otherUserProfile = {
        ...mockProfile1,
        id: 'other-profile',
        account_id: 'other-user',
      };
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1]);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/other-profile/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'other-profile' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Profile not found or does not belong to you');
    });

    it('should select profile successfully and set cookie', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1, mockProfile2]);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-456/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-456' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.profileId).toBe('profile-456');
      
      // Verify cookie was set
      expect(mockCookieStore.set).toHaveBeenCalledWith('x-profile-id', 'profile-456', {
        httpOnly: true,
        secure: false, // NODE_ENV is not production in tests
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    });

    it('should select default profile successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1, mockProfile2]);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.profileId).toBe('profile-123');
      
      expect(mockCookieStore.set).toHaveBeenCalledWith('x-profile-id', 'profile-123', expect.any(Object));
    });

    it('should set secure cookie in production', async () => {
      // Mock NODE_ENV as production
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';

      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1]);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockCookieStore.set).toHaveBeenCalledWith('x-profile-id', 'profile-123', {
        httpOnly: true,
        secure: true, // Should be true in production
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });

      // Restore original NODE_ENV
      (process.env as any).NODE_ENV = originalEnv;
    });

    it('should return 500 when service throws error', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockRejectedValue(new Error('Database error'));

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to select profile');
    });

    it('should return 500 when cookie setting fails', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile1]);
      mockCookieStore.set.mockImplementation(() => {
        throw new Error('Cookie error');
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123/select', {
        method: 'POST',
      });
      
      const response = await POST(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to select profile');
    });
  });
});