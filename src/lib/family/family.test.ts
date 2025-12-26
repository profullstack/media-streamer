/**
 * Family Plan Module Tests
 * 
 * TDD tests for family plan management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFamilyPlan,
  validateFamilyPlan,
  addFamilyMember,
  removeFamilyMember,
  getFamilyMembers,
  canAddMember,
  createInvitation,
  validateInvitation,
  acceptInvitation,
  declineInvitation,
  expireInvitation,
  isInvitationExpired,
  generateInviteCode,
  getMemberRole,
  updateMemberRole,
  transferOwnership,
  leaveFamilyPlan,
  FamilyPlan,
  FamilyMember,
  FamilyInvitation,
  MemberRole,
  InvitationStatus,
  MAX_FAMILY_MEMBERS,
} from './family';

describe('Family Plan Module', () => {
  describe('Family Plan Creation', () => {
    it('should create a family plan', () => {
      const plan = createFamilyPlan({
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
      });

      expect(plan.id).toBeDefined();
      expect(plan.ownerId).toBe('user-123');
      expect(plan.ownerEmail).toBe('owner@example.com');
      expect(plan.planName).toBe('Smith Family');
      expect(plan.members).toHaveLength(1); // Owner is first member
      expect(plan.members[0].role).toBe('owner');
      expect(plan.createdAt).toBeInstanceOf(Date);
    });

    it('should use default plan name if not provided', () => {
      const plan = createFamilyPlan({
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
      });

      expect(plan.planName).toBe('My Family');
    });
  });

  describe('Family Plan Validation', () => {
    it('should validate correct family plan', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      expect(validateFamilyPlan(plan)).toBe(true);
    });

    it('should reject plan without owner', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: '',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [],
        createdAt: new Date(),
      };

      expect(validateFamilyPlan(plan)).toBe(false);
    });

    it('should reject plan with invalid email', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'invalid-email',
        planName: 'Smith Family',
        members: [],
        createdAt: new Date(),
      };

      expect(validateFamilyPlan(plan)).toBe(false);
    });
  });

  describe('Family Member Management', () => {
    it('should add a family member', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = addFamilyMember(plan, {
        userId: 'user-456',
        email: 'member@example.com',
        role: 'member',
      });

      expect(updated.members).toHaveLength(2);
      expect(updated.members[1].email).toBe('member@example.com');
      expect(updated.members[1].role).toBe('member');
    });

    it('should remove a family member', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = removeFamilyMember(plan, 'member-2');

      expect(updated.members).toHaveLength(1);
      expect(updated.members[0].id).toBe('member-1');
    });

    it('should not remove the owner', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = removeFamilyMember(plan, 'member-1');

      expect(updated.members).toHaveLength(1); // Owner still there
    });

    it('should get family members', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const members = getFamilyMembers(plan);

      expect(members).toHaveLength(2);
    });
  });

  describe('Member Limits', () => {
    it('should allow adding members up to limit', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      expect(canAddMember(plan)).toBe(true);
    });

    it('should not allow adding members beyond limit', () => {
      const members: FamilyMember[] = Array.from({ length: MAX_FAMILY_MEMBERS }, (_, i) => ({
        id: `member-${i}`,
        userId: `user-${i}`,
        email: `member${i}@example.com`,
        role: i === 0 ? 'owner' : 'member',
        joinedAt: new Date(),
      }));

      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-0',
        ownerEmail: 'member0@example.com',
        planName: 'Smith Family',
        members,
        createdAt: new Date(),
      };

      expect(canAddMember(plan)).toBe(false);
    });

    it('should have max family members of 10', () => {
      expect(MAX_FAMILY_MEMBERS).toBe(10);
    });
  });

  describe('Invitation Creation', () => {
    it('should create an invitation', () => {
      const invitation = createInvitation({
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        expiresInDays: 7,
      });

      expect(invitation.id).toBeDefined();
      expect(invitation.familyPlanId).toBe('family-123');
      expect(invitation.inviterEmail).toBe('owner@example.com');
      expect(invitation.inviteeEmail).toBe('newmember@example.com');
      expect(invitation.status).toBe('pending');
      expect(invitation.code).toBeDefined();
      expect(invitation.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate unique invite codes', () => {
      const code1 = generateInviteCode();
      const code2 = generateInviteCode();

      expect(code1).not.toBe(code2);
      expect(code1.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Invitation Validation', () => {
    it('should validate correct invitation', () => {
      const invitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(validateInvitation(invitation)).toBe(true);
    });

    it('should reject invitation with invalid email', () => {
      const invitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'invalid-email',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(validateInvitation(invitation)).toBe(false);
    });
  });

  describe('Invitation Status', () => {
    it('should accept invitation', () => {
      const invitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const accepted = acceptInvitation(invitation);

      expect(accepted.status).toBe('accepted');
      expect(accepted.acceptedAt).toBeInstanceOf(Date);
    });

    it('should decline invitation', () => {
      const invitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      const declined = declineInvitation(invitation);

      expect(declined.status).toBe('declined');
    });

    it('should expire invitation', () => {
      const invitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // Already expired
      };

      const expired = expireInvitation(invitation);

      expect(expired.status).toBe('expired');
    });

    it('should check if invitation is expired', () => {
      const expiredInvitation: FamilyInvitation = {
        id: 'invite-123',
        familyPlanId: 'family-123',
        inviterEmail: 'owner@example.com',
        inviteeEmail: 'newmember@example.com',
        code: 'ABC12345',
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      };

      const validInvitation: FamilyInvitation = {
        ...expiredInvitation,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(isInvitationExpired(expiredInvitation)).toBe(true);
      expect(isInvitationExpired(validInvitation)).toBe(false);
    });
  });

  describe('Member Roles', () => {
    it('should get member role', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      expect(getMemberRole(plan, 'user-123')).toBe('owner');
      expect(getMemberRole(plan, 'user-456')).toBe('member');
      expect(getMemberRole(plan, 'user-999')).toBeNull();
    });

    it('should update member role', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = updateMemberRole(plan, 'user-456', 'admin');

      expect(getMemberRole(updated, 'user-456')).toBe('admin');
    });
  });

  describe('Ownership Transfer', () => {
    it('should transfer ownership', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = transferOwnership(plan, 'user-456');

      expect(updated.ownerId).toBe('user-456');
      expect(updated.ownerEmail).toBe('member@example.com');
      expect(getMemberRole(updated, 'user-456')).toBe('owner');
      expect(getMemberRole(updated, 'user-123')).toBe('member');
    });

    it('should not transfer to non-member', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = transferOwnership(plan, 'user-999');

      expect(updated.ownerId).toBe('user-123'); // Unchanged
    });
  });

  describe('Leave Family Plan', () => {
    it('should allow member to leave', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = leaveFamilyPlan(plan, 'user-456');

      expect(updated.members).toHaveLength(1);
      expect(getMemberRole(updated, 'user-456')).toBeNull();
    });

    it('should not allow owner to leave without transferring', () => {
      const plan: FamilyPlan = {
        id: 'family-123',
        ownerId: 'user-123',
        ownerEmail: 'owner@example.com',
        planName: 'Smith Family',
        members: [
          { id: 'member-1', userId: 'user-123', email: 'owner@example.com', role: 'owner', joinedAt: new Date() },
          { id: 'member-2', userId: 'user-456', email: 'member@example.com', role: 'member', joinedAt: new Date() },
        ],
        createdAt: new Date(),
      };

      const updated = leaveFamilyPlan(plan, 'user-123');

      expect(updated.members).toHaveLength(2); // Owner still there
    });
  });

  describe('Role Types', () => {
    it('should have correct role values', () => {
      const roles: MemberRole[] = ['owner', 'admin', 'member'];
      
      roles.forEach(role => {
        expect(typeof role).toBe('string');
      });
    });
  });

  describe('Invitation Status Types', () => {
    it('should have correct status values', () => {
      const statuses: InvitationStatus[] = ['pending', 'accepted', 'declined', 'expired'];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });
});
