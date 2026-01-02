/**
 * Family Plan Repository
 * 
 * Server-side repository for managing family plans in Supabase.
 * All operations are performed server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// ============================================================================
// Types
// ============================================================================

export type MemberRole = 'owner' | 'admin' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export interface FamilyPlanInfo {
  familyPlanId: string;
  planName: string;
  ownerId: string;
  ownerEmail: string;
  memberCount: number;
  userRole: MemberRole;
  createdAt: Date;
}

export interface FamilyMemberInfo {
  memberId: string;
  userId: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface FamilyInvitationInfo {
  invitationId: string;
  inviteeEmail: string;
  inviteCode: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInvitationParams {
  familyPlanId: string;
  inviterId: string;
  inviterEmail: string;
  inviteeEmail: string;
  inviteCode: string;
  expiresAt: Date;
}

export interface AcceptInvitationResult {
  success: boolean;
  message: string;
  familyPlanId: string | null;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export interface FamilyPlanRepository {
  createFamilyPlan(userId: string, userEmail: string, planName?: string): Promise<FamilyPlanRecord>;
  getFamilyPlan(userId: string): Promise<FamilyPlanInfo | null>;
  getFamilyMembers(familyPlanId: string): Promise<FamilyMemberInfo[]>;
  createInvitation(params: CreateInvitationParams): Promise<FamilyInvitationRecord>;
  getInvitationByCode(inviteCode: string): Promise<FamilyInvitationRecord | null>;
  acceptInvitation(inviteCode: string, userId: string, userEmail: string): Promise<AcceptInvitationResult>;
  removeMember(familyPlanId: string, memberId: string, requesterId: string): Promise<OperationResult>;
  getPendingInvitations(familyPlanId: string): Promise<FamilyInvitationInfo[]>;
  revokeInvitation(invitationId: string, requesterId: string): Promise<OperationResult>;
  canInviteMember(familyPlanId: string): Promise<boolean>;
  getFamilyOwnerId(userId: string): Promise<string | null>;
}

// Database record types
interface FamilyPlanRecord {
  id: string;
  owner_id: string;
  plan_name: string;
  created_at: string;
  updated_at: string;
}

interface FamilyInvitationRecord {
  id: string;
  family_plan_id: string;
  inviter_id: string;
  inviter_email: string;
  invitee_email: string;
  invite_code: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Repository Implementation
// ============================================================================

export function createFamilyPlanRepository(
  client: SupabaseClient<Database>
): FamilyPlanRepository {
  return {
    /**
     * Create a family plan for a user
     */
    async createFamilyPlan(
      userId: string,
      userEmail: string,
      planName: string = 'My Family'
    ): Promise<FamilyPlanRecord> {
      const { data, error } = await client.rpc('create_family_plan_for_user', {
        p_user_id: userId,
        p_user_email: userEmail,
        p_plan_name: planName,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data as FamilyPlanRecord;
    },

    /**
     * Get family plan for a user (either as owner or member)
     */
    async getFamilyPlan(userId: string): Promise<FamilyPlanInfo | null> {
      const { data, error } = await client.rpc('get_user_family_plan', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      return {
        familyPlanId: row.family_plan_id,
        planName: row.plan_name,
        ownerId: row.owner_id,
        ownerEmail: row.owner_email,
        memberCount: row.member_count,
        userRole: row.user_role as MemberRole,
        createdAt: new Date(row.created_at),
      };
    },

    /**
     * Get all members of a family plan
     */
    async getFamilyMembers(familyPlanId: string): Promise<FamilyMemberInfo[]> {
      const { data, error } = await client.rpc('get_family_members', {
        p_family_plan_id: familyPlanId,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((row: {
        member_id: string;
        user_id: string;
        email: string;
        role: string;
        joined_at: string;
      }) => ({
        memberId: row.member_id,
        userId: row.user_id,
        email: row.email,
        role: row.role as MemberRole,
        joinedAt: new Date(row.joined_at),
      }));
    },

    /**
     * Create a family invitation
     */
    async createInvitation(params: CreateInvitationParams): Promise<FamilyInvitationRecord> {
      const { data, error } = await client
        .from('family_invitations')
        .insert({
          family_plan_id: params.familyPlanId,
          inviter_id: params.inviterId,
          inviter_email: params.inviterEmail,
          invitee_email: params.inviteeEmail,
          invite_code: params.inviteCode,
          expires_at: params.expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as FamilyInvitationRecord;
    },

    /**
     * Get invitation by code
     */
    async getInvitationByCode(inviteCode: string): Promise<FamilyInvitationRecord | null> {
      const { data, error } = await client
        .from('family_invitations')
        .select('*')
        .eq('invite_code', inviteCode)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(error.message);
      }

      return data as FamilyInvitationRecord;
    },

    /**
     * Accept a family invitation
     */
    async acceptInvitation(
      inviteCode: string,
      userId: string,
      userEmail: string
    ): Promise<AcceptInvitationResult> {
      const { data, error } = await client.rpc('accept_family_invitation', {
        p_invite_code: inviteCode,
        p_user_id: userId,
        p_user_email: userEmail,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return {
        success: row.success,
        message: row.message,
        familyPlanId: row.family_plan_id,
      };
    },

    /**
     * Remove a family member
     */
    async removeMember(
      familyPlanId: string,
      memberId: string,
      requesterId: string
    ): Promise<OperationResult> {
      const { data, error } = await client.rpc('remove_family_member', {
        p_family_plan_id: familyPlanId,
        p_member_id: memberId,
        p_requester_id: requesterId,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return {
        success: row.success,
        message: row.message,
      };
    },

    /**
     * Get pending invitations for a family plan
     */
    async getPendingInvitations(familyPlanId: string): Promise<FamilyInvitationInfo[]> {
      const { data, error } = await client.rpc('get_family_invitations', {
        p_family_plan_id: familyPlanId,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((row: {
        invitation_id: string;
        invitee_email: string;
        invite_code: string;
        status: string;
        expires_at: string;
        created_at: string;
      }) => ({
        invitationId: row.invitation_id,
        inviteeEmail: row.invitee_email,
        inviteCode: row.invite_code,
        status: row.status as InvitationStatus,
        expiresAt: new Date(row.expires_at),
        createdAt: new Date(row.created_at),
      }));
    },

    /**
     * Revoke a pending invitation
     */
    async revokeInvitation(
      invitationId: string,
      requesterId: string
    ): Promise<OperationResult> {
      const { data, error } = await client.rpc('revoke_family_invitation', {
        p_invitation_id: invitationId,
        p_requester_id: requesterId,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return {
        success: row.success,
        message: row.message,
      };
    },

    /**
     * Check if more members can be invited
     */
    async canInviteMember(familyPlanId: string): Promise<boolean> {
      const { data, error } = await client.rpc('can_invite_family_member', {
        p_family_plan_id: familyPlanId,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data as boolean;
    },

    /**
     * Get the family plan owner ID for a user
     */
    async getFamilyOwnerId(userId: string): Promise<string | null> {
      const { data, error } = await client.rpc('get_family_owner_id', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data as string | null;
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getServerClient } from '../supabase/client';

let repositoryInstance: FamilyPlanRepository | null = null;

/**
 * Get the singleton family plan repository instance
 */
export function getFamilyPlanRepository(): FamilyPlanRepository {
  if (!repositoryInstance) {
    repositoryInstance = createFamilyPlanRepository(getServerClient());
  }
  return repositoryInstance;
}

/**
 * Reset the repository instance (for testing)
 */
export function resetFamilyPlanRepository(): void {
  repositoryInstance = null;
}
