/**
 * Profiles API Route Tests
 * 
 * Tests for the profiles management API endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserWithSubscription: vi.fn(),
}));

// Mock the profiles service
vi.mock('@/lib/profiles', () => ({
  getProfilesService: vi.fn(),
}));

const mockProfilesService: any = {
  getAccountProfiles: vi.fn(),
  createProfile: vi.fn(),
};

const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
};

const mockUserWithSubscription = {
  id: 'user-123',
  email: 'user@example.com',
  subscription_tier: 'family' as const,
  subscription_expired: false,
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

describe('Profiles API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { getProfilesService } = vi.mocked(await import('@/lib/profiles'));
    getProfilesService.mockReturnValue(mockProfilesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/profiles', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return user profiles when authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const mockProfiles = [mockProfile];
      mockProfilesService.getAccountProfiles.mockResolvedValue(mockProfiles);

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.profiles).toEqual(mockProfiles);
      expect(mockProfilesService.getAccountProfiles).toHaveBeenCalledWith('user-123');
    });

    it('should return 500 when service throws error', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.getAccountProfiles.mockRejectedValue(new Error('Database error'));

      const { GET } = await import('./route');
      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch profiles');
    });
  });

  describe('POST /api/profiles', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Profile' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 403 when user is not on family plan and already has profile', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue({
        ...mockUserWithSubscription,
        subscription_tier: 'premium',
      });
      
      const existingProfiles = [mockProfile];
      mockProfilesService.getAccountProfiles.mockResolvedValue(existingProfiles);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Second Profile' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Multiple profiles are only available on the Family plan');
    });

    it('should allow family tier users to create additional profiles', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      const existingProfiles = [mockProfile];
      mockProfilesService.getAccountProfiles.mockResolvedValue(existingProfiles);
      mockProfilesService.createProfile.mockResolvedValue(mockProfile);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Second Profile', avatar_emoji: '🎮' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.profile).toEqual(mockProfile);
      expect(mockProfilesService.createProfile).toHaveBeenCalledWith({
        account_id: 'user-123',
        name: 'Second Profile',
        avatar_emoji: '🎮',
        avatar_url: undefined,
      });
    });

    it('should return 400 when profile name is missing', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Profile name is required');
    });

    it('should return 400 when profile name is too long', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'a'.repeat(51) }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Profile name must be 50 characters or less');
    });

    it('should return 400 when max profiles reached', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      // Mock 5 existing profiles (passes family tier check but should trigger max limit in service)
      const maxProfiles = Array.from({ length: 10 }, (_, i) => ({
        id: `profile-${i + 1}`,
        account_id: 'user-123',
        name: `Profile ${i + 1}`,
        avatar_url: null,
        avatar_emoji: null,
        is_default: i === 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }));
      mockProfilesService.getAccountProfiles.mockResolvedValue(maxProfiles);
      // Mock createProfile to throw max profiles error
      mockProfilesService.createProfile.mockRejectedValue(new Error('Maximum 10 profiles per account'));

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Sixth Profile' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Maximum 10 profiles per account allowed');
    });

    it('should return 409 when profile name already exists', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      // Mock fewer than 5 profiles so we pass the max check
      mockProfilesService.getAccountProfiles.mockResolvedValue([mockProfile]);
      // Then mock create to fail with duplicate key
      mockProfilesService.createProfile.mockRejectedValue(new Error('duplicate key'));

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing Profile' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('A profile with this name already exists');
    });

    it('should return 500 when service throws unexpected error', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      mockProfilesService.getAccountProfiles.mockRejectedValue(new Error('Database error'));

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Profile' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create profile');
    });
  });
});