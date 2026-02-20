/**
 * Profiles Service Tests
 * 
 * Tests for the ProfilesService class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProfilesService, getProfilesService } from './profiles-service';
import type { CreateProfileInput, UpdateProfileInput } from './types';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

const mockSupabaseClient = {
  from: vi.fn(),
};

const mockQueryBuilder = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  single: vi.fn(),
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

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { createServerClient } = vi.mocked(await import('@/lib/supabase'));
    createServerClient.mockReturnValue(mockSupabaseClient as any);
    
    // Set up mock chain - each method returns the builder for chaining
    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.insert.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.update.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.delete.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.order.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.single.mockReturnValue(mockQueryBuilder);
    
    service = new ProfilesService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAccountProfiles', () => {
    it('should return profiles ordered by default first, then creation date', async () => {
      const mockProfiles = [mockDefaultProfile, mockProfile];
      
      // Create a complete mock chain
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };
      
      // The final order call should resolve to the result
      mockChain.order
        .mockReturnValueOnce(mockChain) // First order call
        .mockResolvedValueOnce({ data: mockProfiles, error: null }); // Second order call
      
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.getAccountProfiles('user-123');

      expect(result).toEqual(mockProfiles);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockChain.select).toHaveBeenCalledWith('*');
      expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'user-123');
      expect(mockChain.order).toHaveBeenCalledWith('is_default', { ascending: false });
      expect(mockChain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('should return empty array when no profiles found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };
      
      mockChain.order
        .mockReturnValueOnce(mockChain)
        .mockResolvedValueOnce({ data: null, error: null });
      
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.getAccountProfiles('user-123');

      expect(result).toEqual([]);
    });

    it('should throw error when query fails', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };
      
      mockChain.order
        .mockReturnValueOnce(mockChain)
        .mockResolvedValueOnce({ 
          data: null, 
          error: { message: 'Database error' } 
        });
      
      mockSupabaseClient.from.mockReturnValue(mockChain);

      await expect(service.getAccountProfiles('user-123'))
        .rejects.toThrow('Database error');
    });
  });

  describe('getDefaultProfile', () => {
    it('should return default profile for account', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: mockDefaultProfile, 
        error: null 
      });

      const result = await service.getDefaultProfile('user-123');

      expect(result).toEqual(mockDefaultProfile);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('account_id', 'user-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('is_default', true);
    });

    it('should return null when no default profile found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await service.getDefaultProfile('user-123');

      expect(result).toBeNull();
    });

    it('should throw error for other database errors', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      await expect(service.getDefaultProfile('user-123'))
        .rejects.toThrow('Database error');
    });
  });

  describe('getProfileById', () => {
    it('should return profile when found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: mockProfile, 
        error: null 
      });

      const result = await service.getProfileById('user-123', 'profile-123');

      expect(result).toEqual(mockProfile);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('account_id', 'user-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'profile-123');
    });

    it('should return null when profile not found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await service.getProfileById('user-123', 'profile-123');

      expect(result).toBeNull();
    });
  });

  describe('createProfile', () => {
    it('should create profile successfully', async () => {
      const input: CreateProfileInput = {
        account_id: 'user-123',
        name: 'New Profile',
        avatar_emoji: '🎮',
      };

      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: mockProfile, 
        error: null 
      });

      const result = await service.createProfile(input);

      expect(result).toEqual(mockProfile);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(input);
      expect(mockQueryBuilder.select).toHaveBeenCalled();
    });

    it('should throw error when creation fails', async () => {
      const input: CreateProfileInput = {
        account_id: 'user-123',
        name: 'New Profile',
      };

      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Constraint violation' } 
      });

      await expect(service.createProfile(input))
        .rejects.toThrow('Constraint violation');
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const input: UpdateProfileInput = {
        name: 'Updated Profile',
        avatar_emoji: '🏆',
      };

      const updatedProfile = { ...mockProfile, ...input };
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: updatedProfile, 
        error: null 
      });

      const result = await service.updateProfile('user-123', 'profile-123', input);

      expect(result).toEqual(updatedProfile);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(input);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('account_id', 'user-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'profile-123');
    });

    it('should throw error when profile not found', async () => {
      const input: UpdateProfileInput = { name: 'Updated Profile' };

      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      await expect(service.updateProfile('user-123', 'profile-123', input))
        .rejects.toThrow('Profile not found');
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile successfully', async () => {
      // Mock getProfileById to return a non-default profile
      vi.spyOn(service, 'getProfileById').mockResolvedValueOnce(mockProfile);
      // Mock getAccountProfiles to return multiple profiles
      vi.spyOn(service, 'getAccountProfiles').mockResolvedValueOnce([mockDefaultProfile, mockProfile]);
      
      // Create a complete mock chain for delete
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      
      // The final eq call should resolve
      mockChain.eq
        .mockReturnValueOnce(mockChain) // First eq call
        .mockResolvedValueOnce({ error: null }); // Second eq call
      
      mockSupabaseClient.from.mockReturnValue(mockChain);

      await expect(service.deleteProfile('user-123', 'profile-123'))
        .resolves.not.toThrow();

      expect(mockChain.delete).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'user-123');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'profile-123');
    });

    it('should throw error when profile not found', async () => {
      vi.spyOn(service, 'getProfileById').mockResolvedValueOnce(null);

      await expect(service.deleteProfile('user-123', 'profile-123'))
        .rejects.toThrow('Profile not found');
    });

    it('should throw error when trying to delete default profile', async () => {
      vi.spyOn(service, 'getProfileById').mockResolvedValueOnce(mockDefaultProfile);

      await expect(service.deleteProfile('user-123', 'profile-123'))
        .rejects.toThrow('Cannot delete default profile');
    });

    it('should throw error when trying to delete last profile', async () => {
      vi.spyOn(service, 'getProfileById').mockResolvedValueOnce(mockProfile);
      vi.spyOn(service, 'getAccountProfiles').mockResolvedValueOnce([mockProfile]);

      await expect(service.deleteProfile('user-123', 'profile-123'))
        .rejects.toThrow('Cannot delete last profile');
    });

    it('should throw error when delete operation fails', async () => {
      vi.spyOn(service, 'getProfileById').mockResolvedValueOnce(mockProfile);
      vi.spyOn(service, 'getAccountProfiles').mockResolvedValueOnce([mockDefaultProfile, mockProfile]);
      
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      
      mockChain.eq
        .mockReturnValueOnce(mockChain)
        .mockResolvedValueOnce({ 
          error: { message: 'Database error' } 
        });
      
      mockSupabaseClient.from.mockReturnValue(mockChain);

      await expect(service.deleteProfile('user-123', 'profile-123'))
        .rejects.toThrow('Database error');
    });
  });

  describe('setDefaultProfile', () => {
    it('should set profile as default successfully', async () => {
      const updatedProfile = { ...mockProfile, is_default: true };
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: updatedProfile, 
        error: null 
      });

      const result = await service.setDefaultProfile('user-123', 'profile-123');

      expect(result).toEqual(updatedProfile);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ is_default: true });
    });

    it('should throw error when profile not found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      await expect(service.setDefaultProfile('user-123', 'profile-123'))
        .rejects.toThrow('Profile not found');
    });
  });

  describe('ensureDefaultProfile', () => {
    it('should return existing default profile', async () => {
      vi.spyOn(service, 'getDefaultProfile').mockResolvedValueOnce(mockDefaultProfile);

      const result = await service.ensureDefaultProfile('user-123');

      expect(result).toEqual(mockDefaultProfile);
      expect(service.getDefaultProfile).toHaveBeenCalledWith('user-123');
    });

    it('should create default profile when none exists', async () => {
      vi.spyOn(service, 'getDefaultProfile').mockResolvedValueOnce(null);
      vi.spyOn(service, 'createProfile').mockResolvedValueOnce(mockDefaultProfile);

      const result = await service.ensureDefaultProfile('user-123');

      expect(result).toEqual(mockDefaultProfile);
      expect(service.createProfile).toHaveBeenCalledWith({
        account_id: 'user-123',
        name: 'Profile 1',
        is_default: true,
      });
    });

    it('should create default profile with custom name', async () => {
      vi.spyOn(service, 'getDefaultProfile').mockResolvedValueOnce(null);
      vi.spyOn(service, 'createProfile').mockResolvedValueOnce(mockDefaultProfile);

      const result = await service.ensureDefaultProfile('user-123', 'Custom Profile');

      expect(result).toEqual(mockDefaultProfile);
      expect(service.createProfile).toHaveBeenCalledWith({
        account_id: 'user-123',
        name: 'Custom Profile',
        is_default: true,
      });
    });
  });

  describe('getProfilesService singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getProfilesService();
      const instance2 = getProfilesService();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ProfilesService);
    });
  });
});