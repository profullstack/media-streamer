/**
 * Family Members API Route Tests
 * 
 * Tests for the family members management API endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock the family repository
vi.mock('@/lib/family', () => ({
  getFamilyPlanRepository: vi.fn(),
}));

describe('Family Members API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/family/members', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when user has no family plan', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue(null),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('You are not a member of a family plan');
    });

    it('should return family members successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockMembers = [
        {
          id: 'member-1',
          userId: 'user-123',
          email: 'test@example.com',
          role: 'owner',
          joinedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'member-2',
          userId: 'user-456',
          email: 'member@example.com',
          role: 'member',
          joinedAt: '2025-01-02T00:00:00Z',
        },
      ];

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-123',
          ownerId: 'user-123',
          ownerEmail: 'test@example.com',
          userRole: 'owner',
          planName: 'Test Family',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        getFamilyMembers: vi.fn().mockResolvedValue(mockMembers),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.members).toHaveLength(2);
      expect(data.members[0].role).toBe('owner');
      expect(data.members[1].role).toBe('member');
    });
  });

  describe('DELETE /api/family/members', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members?memberId=member-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when member ID is missing', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Member ID is required');
    });

    it('should return 404 when user has no family plan', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue(null),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members?memberId=member-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('You are not a member of a family plan');
    });

    it('should remove member successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-123',
          ownerId: 'user-123',
          ownerEmail: 'test@example.com',
          userRole: 'owner',
          planName: 'Test Family',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        removeMember: vi.fn().mockResolvedValue({
          success: true,
          message: 'Member removed successfully',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members?memberId=member-456', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Member removed successfully');
    });

    it('should return 400 when remove fails', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-123',
          ownerId: 'user-123',
          ownerEmail: 'test@example.com',
          userRole: 'owner',
          planName: 'Test Family',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        removeMember: vi.fn().mockResolvedValue({
          success: false,
          message: 'Cannot remove the owner from the family plan',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members?memberId=member-owner', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Cannot remove the owner from the family plan');
    });

    it('should allow member to remove themselves', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-member',
        email: 'member@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-123',
          ownerId: 'user-owner',
          ownerEmail: 'owner@example.com',
          userRole: 'member',
          planName: 'Test Family',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        removeMember: vi.fn().mockResolvedValue({
          success: true,
          message: 'You have left the family plan',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/members?memberId=user-member', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
