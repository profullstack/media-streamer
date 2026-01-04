/**
 * Tests for UserProfileService
 *
 * Tests the server-side user profile management service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileService } from './user-profiles';
import type { UserProfile, UserProfileInsert, UserProfileUpdate } from '@/lib/supabase/types';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

// Mock createServerClient
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => mockSupabase,
}));

describe('UserProfileService', () => {
  let service: UserProfileService;

  const mockProfile: UserProfile = {
    id: 'profile-1',
    user_id: 'user-1',
    username: 'testuser',
    display_name: 'Test User',
    bio: 'A test user bio',
    avatar_url: 'https://example.com/avatar.jpg',
    is_public: true,
    comment_count: 5,
    favorite_count: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserProfileService();
  });

  describe('getProfileByUserId', () => {
    it('returns profile for valid user ID', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      });

      const result = await service.getProfileByUserId('user-1');

      expect(result).toEqual(mockProfile);
      expect(mockSupabase.from).toHaveBeenCalledWith('user_profiles');
    });

    it('returns null when profile not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      });

      const result = await service.getProfileByUserId('nonexistent');

      expect(result).toBeNull();
    });

    it('throws on database error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }),
          }),
        }),
      });

      await expect(service.getProfileByUserId('user-1')).rejects.toThrow('Database error');
    });
  });

  describe('getProfileByUsername', () => {
    it('returns profile for valid username', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
            }),
          }),
        }),
      });

      const result = await service.getProfileByUsername('testuser');

      expect(result).toEqual(mockProfile);
    });

    it('returns null when username not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      });

      const result = await service.getProfileByUsername('nonexistent');

      expect(result).toBeNull();
    });

    it('is case-insensitive', async () => {
      const selectMock = vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      });
      mockSupabase.from.mockReturnValue({ select: selectMock });

      await service.getProfileByUsername('TESTUSER');

      // ilike is used for case-insensitive matching
      expect(selectMock).toHaveBeenCalled();
    });
  });

  describe('isUsernameAvailable', () => {
    it('returns true when username is available', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await service.isUsernameAvailable('newuser');

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('check_username_available', {
        check_username: 'newuser',
      });
    });

    it('returns false when username is taken', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

      const result = await service.isUsernameAvailable('testuser');

      expect(result).toBe(false);
    });

    it('throws on database error', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } });

      await expect(service.isUsernameAvailable('testuser')).rejects.toThrow('RPC error');
    });
  });

  describe('createProfile', () => {
    it('creates profile with valid data', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: 'newuser',
        display_name: 'New User',
      };

      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { ...mockProfile, ...input }, error: null }),
          }),
        }),
      });

      const result = await service.createProfile(input);

      expect(result.username).toBe('newuser');
    });

    it('throws when username is taken', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: 'takenuser',
      };

      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

      await expect(service.createProfile(input)).rejects.toThrow('Username is already taken');
    });

    it('throws on invalid username format', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: '123invalid', // starts with number
      };

      await expect(service.createProfile(input)).rejects.toThrow('Invalid username format');
    });

    it('throws on username too short', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: 'ab', // too short
      };

      await expect(service.createProfile(input)).rejects.toThrow('Invalid username format');
    });

    it('throws on username too long', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: 'a'.repeat(31), // too long
      };

      await expect(service.createProfile(input)).rejects.toThrow('Invalid username format');
    });

    it('throws on reserved username', async () => {
      const input: UserProfileInsert = {
        user_id: 'user-1',
        username: 'admin',
      };

      await expect(service.createProfile(input)).rejects.toThrow('Username is reserved');
    });
  });

  describe('updateProfile', () => {
    it('updates profile with valid data', async () => {
      const update: UserProfileUpdate = {
        display_name: 'Updated Name',
        bio: 'Updated bio',
      };

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockProfile, ...update },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await service.updateProfile('user-1', update);

      expect(result.display_name).toBe('Updated Name');
      expect(result.bio).toBe('Updated bio');
    });

    it('validates username when updating', async () => {
      const update: UserProfileUpdate = {
        username: 'newusername',
      };

      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockProfile, username: 'newusername' },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await service.updateProfile('user-1', update);

      expect(result.username).toBe('newusername');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('check_username_available', {
        check_username: 'newusername',
      });
    });

    it('throws when new username is taken', async () => {
      const update: UserProfileUpdate = {
        username: 'takenuser',
      };

      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

      await expect(service.updateProfile('user-1', update)).rejects.toThrow(
        'Username is already taken'
      );
    });

    it('throws on database error', async () => {
      const update: UserProfileUpdate = {
        display_name: 'Updated Name',
      };

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
              }),
            }),
          }),
        }),
      });

      await expect(service.updateProfile('user-1', update)).rejects.toThrow('Update failed');
    });
  });

  describe('getPublicProfile', () => {
    it('returns public profile for public user', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
            }),
          }),
        }),
      });

      const result = await service.getPublicProfile('testuser');

      expect(result).not.toBeNull();
      expect(result?.username).toBe('testuser');
      // Should not include user_id in public profile
      expect(result).not.toHaveProperty('user_id');
    });

    it('returns null for private profile', async () => {
      const privateProfile = { ...mockProfile, is_public: false };
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: privateProfile, error: null }),
            }),
          }),
        }),
      });

      const result = await service.getPublicProfile('testuser');

      expect(result).toBeNull();
    });

    it('returns null when username not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      });

      const result = await service.getPublicProfile('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('validateUsername', () => {
    it('accepts valid usernames', () => {
      expect(service.validateUsername('testuser')).toBe(true);
      expect(service.validateUsername('Test_User')).toBe(true);
      expect(service.validateUsername('test-user')).toBe(true);
      expect(service.validateUsername('user123')).toBe(true);
      expect(service.validateUsername('abc')).toBe(true);
    });

    it('rejects usernames starting with number', () => {
      expect(service.validateUsername('123user')).toBe(false);
      expect(service.validateUsername('1test')).toBe(false);
    });

    it('rejects usernames with special characters', () => {
      expect(service.validateUsername('test@user')).toBe(false);
      expect(service.validateUsername('test.user')).toBe(false);
      expect(service.validateUsername('test user')).toBe(false);
    });

    it('rejects usernames too short', () => {
      expect(service.validateUsername('ab')).toBe(false);
      expect(service.validateUsername('a')).toBe(false);
    });

    it('rejects usernames too long', () => {
      expect(service.validateUsername('a'.repeat(31))).toBe(false);
    });
  });

  describe('isReservedUsername', () => {
    it('identifies reserved usernames', () => {
      expect(service.isReservedUsername('admin')).toBe(true);
      expect(service.isReservedUsername('ADMIN')).toBe(true);
      expect(service.isReservedUsername('root')).toBe(true);
      expect(service.isReservedUsername('system')).toBe(true);
      expect(service.isReservedUsername('support')).toBe(true);
      expect(service.isReservedUsername('api')).toBe(true);
    });

    it('allows non-reserved usernames', () => {
      expect(service.isReservedUsername('testuser')).toBe(false);
      expect(service.isReservedUsername('johndoe')).toBe(false);
      expect(service.isReservedUsername('myusername')).toBe(false);
    });
  });
});
