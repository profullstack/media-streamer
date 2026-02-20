/**
 * Profile Utils Tests
 * 
 * Tests for profile utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getCurrentProfileId, 
  getCurrentProfile, 
  getCurrentProfileIdWithFallback 
} from './profile-utils';

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Mock auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock profiles service
vi.mock('./profiles-service', () => ({
  getProfilesService: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCookieStore: any = {
  get: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockProfilesService: any = {
  getDefaultProfile: vi.fn(),
  getProfileById: vi.fn(),
};

const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
};

const mockProfile = {
  id: 'profile-123',
  account_id: 'user-123',
  name: 'Test Profile',
  avatar_url: null,
  avatar_emoji: '😀',
  is_default: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockDefaultProfile = {
  ...mockProfile,
  id: 'default-profile',
  name: 'Default Profile',
  is_default: true,
};

describe('Profile Utils', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { cookies } = vi.mocked(await import('next/headers'));
    cookies.mockResolvedValue(mockCookieStore);
    
    const { getProfilesService } = vi.mocked(await import('./profiles-service'));
    getProfilesService.mockReturnValue(mockProfilesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCurrentProfileId', () => {
    it('should return profile ID from cookie', async () => {
      mockCookieStore.get.mockReturnValue({ value: 'profile-123' });

      const result = await getCurrentProfileId();

      expect(result).toBe('profile-123');
      expect(mockCookieStore.get).toHaveBeenCalledWith('x-profile-id');
    });

    it('should return null when cookie is not set', async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      const result = await getCurrentProfileId();

      expect(result).toBeNull();
    });

    it('should return null when cookie has no value', async () => {
      mockCookieStore.get.mockReturnValue({ value: undefined });

      const result = await getCurrentProfileId();

      expect(result).toBeNull();
    });

    it('should return null when cookies() throws error', async () => {
      const { cookies } = vi.mocked(await import('next/headers'));
      cookies.mockRejectedValue(new Error('Static generation error'));

      const result = await getCurrentProfileId();

      expect(result).toBeNull();
    });
  });

  describe('getCurrentProfile', () => {
    it('should return null when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const result = await getCurrentProfile();

      expect(result).toBeNull();
    });

    it('should return current profile from cookie', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue({ value: 'profile-123' });
      mockProfilesService.getProfileById.mockResolvedValue(mockProfile);

      const result = await getCurrentProfile();

      expect(result).toEqual(mockProfile);
      expect(mockProfilesService.getProfileById).toHaveBeenCalledWith('user-123', 'profile-123');
    });

    it('should return null when no profile cookie is set (no fallback)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue(undefined);

      const result = await getCurrentProfile();

      expect(result).toBeNull();
    });

    it('should return null when profile cookie is empty (no fallback)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue({ value: '' });

      const result = await getCurrentProfile();

      expect(result).toBeNull();
    });

    it('should return null when getCurrentProfileId throws error (no fallback)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const { cookies } = vi.mocked(await import('next/headers'));
      cookies.mockRejectedValue(new Error('Cookie error'));

      const result = await getCurrentProfile();

      expect(result).toBeNull();
    });

    it('should return null when profile service throws error', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue(undefined);
      mockProfilesService.getDefaultProfile.mockRejectedValue(new Error('Database error'));

      const result = await getCurrentProfile();

      expect(result).toBeNull();
    });
  });

  describe('getCurrentProfileIdWithFallback', () => {
    it('should return null when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });

    it('should return profile ID from cookie when profile exists', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue({ value: 'profile-123' });
      mockProfilesService.getProfileById.mockResolvedValue(mockProfile);

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBe('profile-123');
      expect(mockProfilesService.getProfileById).toHaveBeenCalledWith('user-123', 'profile-123');
    });

    it('should return null when cookie profile not found (no fallback)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue({ value: 'nonexistent-profile' });
      mockProfilesService.getProfileById.mockResolvedValue(null);

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });

    it('should return null when no cookie is set (no fallback)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue(undefined);

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });

    it('should return null when no default profile exists', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue(undefined);
      mockProfilesService.getDefaultProfile.mockResolvedValue(null);

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });

    it('should return null when an error occurs', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const { cookies } = vi.mocked(await import('next/headers'));
      cookies.mockRejectedValue(new Error('Cookie error'));

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });

    it('should handle profile service errors gracefully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockCookieStore.get.mockReturnValue({ value: 'profile-123' });
      mockProfilesService.getProfileById.mockRejectedValue(new Error('Database error'));

      const result = await getCurrentProfileIdWithFallback();

      expect(result).toBeNull();
    });
  });
});