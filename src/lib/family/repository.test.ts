/**
 * Family Plan Repository Tests
 * 
 * Tests for the family plan database operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFamilyPlanRepository,
  type FamilyPlanRepository,
} from './repository';

// Mock Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const mockClient = {
  rpc: mockRpc,
  from: mockFrom,
} as unknown as Parameters<typeof createFamilyPlanRepository>[0];

describe('Family Plan Repository', () => {
  let repository: FamilyPlanRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup chain mocks
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle, eq: mockEq });
    
    repository = createFamilyPlanRepository(mockClient);
  });

  describe('createFamilyPlan', () => {
    it('should create a family plan for a user', async () => {
      const mockPlan = {
        id: 'plan-123',
        owner_id: 'user-123',
        plan_name: 'Test Family',
        created_at: new Date().toISOString(),
      };

      mockRpc.mockResolvedValueOnce({ data: mockPlan, error: null });

      const result = await repository.createFamilyPlan(
        'user-123',
        'test@example.com',
        'Test Family'
      );

      expect(mockRpc).toHaveBeenCalledWith('create_family_plan_for_user', {
        p_user_id: 'user-123',
        p_user_email: 'test@example.com',
        p_plan_name: 'Test Family',
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw error when creation fails', async () => {
      mockRpc.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      await expect(
        repository.createFamilyPlan('user-123', 'test@example.com')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getFamilyPlan', () => {
    it('should get family plan for a user', async () => {
      const mockPlan = {
        family_plan_id: 'plan-123',
        plan_name: 'Test Family',
        owner_id: 'user-123',
        owner_email: 'owner@example.com',
        member_count: 3,
        user_role: 'owner',
        created_at: new Date().toISOString(),
      };

      mockRpc.mockResolvedValueOnce({ data: [mockPlan], error: null });

      const result = await repository.getFamilyPlan('user-123');

      expect(mockRpc).toHaveBeenCalledWith('get_user_family_plan', {
        p_user_id: 'user-123',
      });
      expect(result).toEqual({
        familyPlanId: 'plan-123',
        planName: 'Test Family',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        memberCount: 3,
        userRole: 'owner',
        createdAt: expect.any(Date),
      });
    });

    it('should return null when user has no family plan', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await repository.getFamilyPlan('user-123');

      expect(result).toBeNull();
    });
  });

  describe('getFamilyMembers', () => {
    it('should get all members of a family plan', async () => {
      const mockMembers = [
        {
          member_id: 'member-1',
          user_id: 'user-1',
          email: 'owner@example.com',
          role: 'owner',
          joined_at: new Date().toISOString(),
        },
        {
          member_id: 'member-2',
          user_id: 'user-2',
          email: 'member@example.com',
          role: 'member',
          joined_at: new Date().toISOString(),
        },
      ];

      mockRpc.mockResolvedValueOnce({ data: mockMembers, error: null });

      const result = await repository.getFamilyMembers('plan-123');

      expect(mockRpc).toHaveBeenCalledWith('get_family_members', {
        p_family_plan_id: 'plan-123',
      });
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('owner');
    });

    it('should return empty array when no members found', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await repository.getFamilyMembers('plan-123');

      expect(result).toEqual([]);
    });
  });

  describe('createInvitation', () => {
    it('should create a family invitation', async () => {
      const mockInvitation = {
        id: 'invite-123',
        family_plan_id: 'plan-123',
        inviter_id: 'user-123',
        inviter_email: 'owner@example.com',
        invitee_email: 'invitee@example.com',
        invite_code: 'ABC12345',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };

      mockSingle.mockResolvedValueOnce({ data: mockInvitation, error: null });

      const result = await repository.createInvitation({
        familyPlanId: 'plan-123',
        inviterId: 'user-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'invitee@example.com',
        inviteCode: 'ABC12345',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(mockFrom).toHaveBeenCalledWith('family_invitations');
      expect(result.invite_code).toBe('ABC12345');
    });

    it('should throw error when invitation creation fails', async () => {
      mockSingle.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Duplicate invitation' } 
      });

      await expect(
        repository.createInvitation({
          familyPlanId: 'plan-123',
          inviterId: 'user-123',
          inviterEmail: 'owner@example.com',
          inviteeEmail: 'invitee@example.com',
          inviteCode: 'ABC12345',
          expiresAt: new Date(),
        })
      ).rejects.toThrow('Duplicate invitation');
    });
  });

  describe('getInvitationByCode', () => {
    it('should get invitation by code', async () => {
      const mockInvitation = {
        id: 'invite-123',
        family_plan_id: 'plan-123',
        inviter_email: 'owner@example.com',
        invitee_email: 'invitee@example.com',
        invite_code: 'ABC12345',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      mockSingle.mockResolvedValueOnce({ data: mockInvitation, error: null });

      const result = await repository.getInvitationByCode('ABC12345');

      expect(result).not.toBeNull();
      expect(result?.invite_code).toBe('ABC12345');
    });

    it('should return null for invalid code', async () => {
      mockSingle.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await repository.getInvitationByCode('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('acceptInvitation', () => {
    it('should accept a valid invitation', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ success: true, message: 'Successfully joined', family_plan_id: 'plan-123' }],
        error: null,
      });

      const result = await repository.acceptInvitation(
        'ABC12345',
        'user-456',
        'newmember@example.com'
      );

      expect(mockRpc).toHaveBeenCalledWith('accept_family_invitation', {
        p_invite_code: 'ABC12345',
        p_user_id: 'user-456',
        p_user_email: 'newmember@example.com',
      });
      expect(result.success).toBe(true);
      expect(result.familyPlanId).toBe('plan-123');
    });

    it('should return error for invalid invitation', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ success: false, message: 'Invalid or expired invitation code', family_plan_id: null }],
        error: null,
      });

      const result = await repository.acceptInvitation(
        'INVALID',
        'user-456',
        'newmember@example.com'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid');
    });
  });

  describe('removeMember', () => {
    it('should remove a family member', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ success: true, message: 'Member removed successfully' }],
        error: null,
      });

      const result = await repository.removeMember(
        'plan-123',
        'member-456',
        'user-123'
      );

      expect(mockRpc).toHaveBeenCalledWith('remove_family_member', {
        p_family_plan_id: 'plan-123',
        p_member_id: 'member-456',
        p_requester_id: 'user-123',
      });
      expect(result.success).toBe(true);
    });

    it('should fail when trying to remove owner', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ success: false, message: 'Cannot remove the family plan owner' }],
        error: null,
      });

      const result = await repository.removeMember(
        'plan-123',
        'owner-member-id',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('owner');
    });
  });

  describe('getPendingInvitations', () => {
    it('should get pending invitations for a family plan', async () => {
      const mockInvitations = [
        {
          invitation_id: 'invite-1',
          invitee_email: 'invitee1@example.com',
          invite_code: 'CODE1',
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      mockRpc.mockResolvedValueOnce({ data: mockInvitations, error: null });

      const result = await repository.getPendingInvitations('plan-123');

      expect(mockRpc).toHaveBeenCalledWith('get_family_invitations', {
        p_family_plan_id: 'plan-123',
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke a pending invitation', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ success: true, message: 'Invitation revoked successfully' }],
        error: null,
      });

      const result = await repository.revokeInvitation('invite-123', 'user-123');

      expect(mockRpc).toHaveBeenCalledWith('revoke_family_invitation', {
        p_invitation_id: 'invite-123',
        p_requester_id: 'user-123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('canInviteMember', () => {
    it('should return true when under member limit', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      const result = await repository.canInviteMember('plan-123');

      expect(mockRpc).toHaveBeenCalledWith('can_invite_family_member', {
        p_family_plan_id: 'plan-123',
      });
      expect(result).toBe(true);
    });

    it('should return false when at member limit', async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null });

      const result = await repository.canInviteMember('plan-123');

      expect(result).toBe(false);
    });
  });

  describe('getFamilyOwnerId', () => {
    it('should get the owner ID for a family member', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'owner-123', error: null });

      const result = await repository.getFamilyOwnerId('member-456');

      expect(mockRpc).toHaveBeenCalledWith('get_family_owner_id', {
        p_user_id: 'member-456',
      });
      expect(result).toBe('owner-123');
    });

    it('should return null when user is not in a family', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await repository.getFamilyOwnerId('user-123');

      expect(result).toBeNull();
    });
  });
});
