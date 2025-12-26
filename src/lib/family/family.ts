/**
 * Family Plan Module
 * 
 * Manages family plan subscriptions with up to 10 members
 */

import { randomUUID } from 'crypto';

// Constants
export const MAX_FAMILY_MEMBERS = 10;

// Types
export type MemberRole = 'owner' | 'admin' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface FamilyMember {
  id: string;
  userId: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface FamilyPlan {
  id: string;
  ownerId: string;
  ownerEmail: string;
  planName: string;
  members: FamilyMember[];
  createdAt: Date;
}

export interface FamilyInvitation {
  id: string;
  familyPlanId: string;
  inviterEmail: string;
  inviteeEmail: string;
  code: string;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export interface CreateFamilyPlanOptions {
  ownerId: string;
  ownerEmail: string;
  planName?: string;
}

export interface AddMemberOptions {
  userId: string;
  email: string;
  role: MemberRole;
}

export interface CreateInvitationOptions {
  familyPlanId: string;
  inviterEmail: string;
  inviteeEmail: string;
  expiresInDays: number;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create a new family plan
 */
export function createFamilyPlan(options: CreateFamilyPlanOptions): FamilyPlan {
  const now = new Date();
  const ownerId = options.ownerId;
  
  const ownerMember: FamilyMember = {
    id: `member-${randomUUID()}`,
    userId: ownerId,
    email: options.ownerEmail,
    role: 'owner',
    joinedAt: now,
  };

  return {
    id: `family-${randomUUID()}`,
    ownerId,
    ownerEmail: options.ownerEmail,
    planName: options.planName || 'My Family',
    members: [ownerMember],
    createdAt: now,
  };
}

/**
 * Validate a family plan
 */
export function validateFamilyPlan(plan: FamilyPlan): boolean {
  if (!plan.ownerId || plan.ownerId.trim() === '') {
    return false;
  }
  
  if (!EMAIL_REGEX.test(plan.ownerEmail)) {
    return false;
  }
  
  return true;
}

/**
 * Add a family member
 */
export function addFamilyMember(plan: FamilyPlan, options: AddMemberOptions): FamilyPlan {
  if (!canAddMember(plan)) {
    return plan;
  }

  const newMember: FamilyMember = {
    id: `member-${randomUUID()}`,
    userId: options.userId,
    email: options.email,
    role: options.role,
    joinedAt: new Date(),
  };

  return {
    ...plan,
    members: [...plan.members, newMember],
  };
}

/**
 * Remove a family member
 */
export function removeFamilyMember(plan: FamilyPlan, memberId: string): FamilyPlan {
  // Don't allow removing the owner
  const member = plan.members.find(m => m.id === memberId);
  if (!member || member.role === 'owner') {
    return plan;
  }

  return {
    ...plan,
    members: plan.members.filter(m => m.id !== memberId),
  };
}

/**
 * Get all family members
 */
export function getFamilyMembers(plan: FamilyPlan): FamilyMember[] {
  return plan.members;
}

/**
 * Check if more members can be added
 */
export function canAddMember(plan: FamilyPlan): boolean {
  return plan.members.length < MAX_FAMILY_MEMBERS;
}

/**
 * Create an invitation
 */
export function createInvitation(options: CreateInvitationOptions): FamilyInvitation {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + options.expiresInDays * 24 * 60 * 60 * 1000);

  return {
    id: `invite-${randomUUID()}`,
    familyPlanId: options.familyPlanId,
    inviterEmail: options.inviterEmail,
    inviteeEmail: options.inviteeEmail,
    code: generateInviteCode(),
    status: 'pending',
    createdAt: now,
    expiresAt,
  };
}

/**
 * Generate a unique invite code
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate an invitation
 */
export function validateInvitation(invitation: FamilyInvitation): boolean {
  if (!EMAIL_REGEX.test(invitation.inviteeEmail)) {
    return false;
  }
  
  if (!EMAIL_REGEX.test(invitation.inviterEmail)) {
    return false;
  }
  
  return true;
}

/**
 * Accept an invitation
 */
export function acceptInvitation(invitation: FamilyInvitation): FamilyInvitation {
  return {
    ...invitation,
    status: 'accepted',
    acceptedAt: new Date(),
  };
}

/**
 * Decline an invitation
 */
export function declineInvitation(invitation: FamilyInvitation): FamilyInvitation {
  return {
    ...invitation,
    status: 'declined',
  };
}

/**
 * Expire an invitation
 */
export function expireInvitation(invitation: FamilyInvitation): FamilyInvitation {
  return {
    ...invitation,
    status: 'expired',
  };
}

/**
 * Check if invitation is expired
 */
export function isInvitationExpired(invitation: FamilyInvitation): boolean {
  return invitation.expiresAt.getTime() < Date.now();
}

/**
 * Get member role
 */
export function getMemberRole(plan: FamilyPlan, userId: string): MemberRole | null {
  const member = plan.members.find(m => m.userId === userId);
  return member ? member.role : null;
}

/**
 * Update member role
 */
export function updateMemberRole(
  plan: FamilyPlan,
  userId: string,
  newRole: MemberRole
): FamilyPlan {
  return {
    ...plan,
    members: plan.members.map(member =>
      member.userId === userId ? { ...member, role: newRole } : member
    ),
  };
}

/**
 * Transfer ownership to another member
 */
export function transferOwnership(plan: FamilyPlan, newOwnerId: string): FamilyPlan {
  const newOwner = plan.members.find(m => m.userId === newOwnerId);
  if (!newOwner) {
    return plan; // Can't transfer to non-member
  }

  return {
    ...plan,
    ownerId: newOwnerId,
    ownerEmail: newOwner.email,
    members: plan.members.map(member => {
      if (member.userId === newOwnerId) {
        return { ...member, role: 'owner' as MemberRole };
      }
      if (member.userId === plan.ownerId) {
        return { ...member, role: 'member' as MemberRole };
      }
      return member;
    }),
  };
}

/**
 * Leave family plan
 */
export function leaveFamilyPlan(plan: FamilyPlan, userId: string): FamilyPlan {
  // Owner can't leave without transferring ownership
  if (userId === plan.ownerId) {
    return plan;
  }

  return {
    ...plan,
    members: plan.members.filter(m => m.userId !== userId),
  };
}
