/**
 * Individual Profile API Route Tests
 * 
 * Tests for PATCH and DELETE operations on individual profiles
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
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  getProfileById: vi.fn(),
  getAccountProfiles: vi.fn(),
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

const mockDefaultProfile = {
  ...mockProfile,
  name: 'Default Profile',
  is_default: true,
};

describe('Individual Profile API Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { getProfilesService } = vi.mocked(await import('@/lib/profiles'));
    getProfilesService.mockReturnValue(mockProfilesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PATCH /api/profiles/[id]', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Profile' }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should update profile name successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const updatedProfile = { ...mockProfile, name: 'Updated Profile' };
      mockProfilesService.updateProfile.mockResolvedValue(updatedProfile);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Profile' }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.profile).toEqual(updatedProfile);
      expect(mockProfilesService.updateProfile).toHaveBeenCalledWith(
        'user-123',
        'profile-123',
        { name: 'Updated Profile' }
      );
    });

    it('should update profile avatar successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      const updatedProfile = { ...mockProfile, avatar_emoji: '🎮' };
      mockProfilesService.updateProfile.mockResolvedValue(updatedProfile);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ 
          avatar_emoji: '🎮',
          avatar_url: 'https://example.com/avatar.jpg' 
        }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockProfilesService.updateProfile).toHaveBeenCalledWith(
        'user-123',
        'profile-123',
        { 
          avatar_emoji: '🎮',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      );
    });

    it('should return 400 when profile name is empty', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: '   ' }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Profile name cannot be empty');
    });

    it('should return 400 when profile name is too long', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'a'.repeat(51) }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Profile name must be 50 characters or less');
    });

    it('should return 400 when no updates provided', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No updates provided');
    });

    it('should return 404 when profile not found', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.updateProfile.mockRejectedValue(new Error('Profile not found'));

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Profile' }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Profile not found');
    });

    it('should return 409 when profile name already exists', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
      
      mockProfilesService.updateProfile.mockRejectedValue(new Error('duplicate key'));

      const { PATCH } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Existing Profile' }),
      });
      
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('A profile with this name already exists');
    });
  });

  describe('DELETE /api/profiles/[id]', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(null);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 403 when user is not on family plan', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue({
        ...mockUserWithSubscription,
        subscription_tier: 'premium',
      });

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Profile management is only available on the Family plan');
    });

    it('should delete profile successfully for family tier users', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      mockProfilesService.deleteProfile.mockResolvedValue(undefined);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockProfilesService.deleteProfile).toHaveBeenCalledWith('user-123', 'profile-123');
    });

    it('should return 404 when profile not found', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      mockProfilesService.deleteProfile.mockRejectedValue(new Error('Profile not found'));

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Profile not found');
    });

    it('should return 400 when trying to delete last profile', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      mockProfilesService.deleteProfile.mockRejectedValue(new Error('Cannot delete last profile'));

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Cannot delete the last profile. Create another profile first.');
    });

    it('should return 500 when service throws unexpected error', async () => {
      const { getCurrentUserWithSubscription } = await import('@/lib/auth');
      vi.mocked(getCurrentUserWithSubscription).mockResolvedValue(mockUserWithSubscription);
      
      mockProfilesService.deleteProfile.mockRejectedValue(new Error('Database connection failed'));

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/profiles/profile-123', {
        method: 'DELETE',
      });
      
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'profile-123' }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to delete profile');
    });
  });
});