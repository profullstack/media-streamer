/**
 * Family Invitation API Route Tests
 * 
 * Tests for the family invitation management API endpoints
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
  generateInviteCode: vi.fn().mockReturnValue('ABC123XY'),
}));

// Mock the email service
vi.mock('@/lib/email', () => ({
  getEmailService: vi.fn(),
}));

describe('Family Invitation API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/family/invite', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when email is missing', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Valid email address is required');
    });

    it('should return 400 when email is invalid', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'invalid-email' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Valid email address is required');
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

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('You do not have a family plan');
    });

    it('should return 403 when user is not owner or admin', async () => {
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

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You do not have permission to invite members');
    });

    it('should return 400 when family plan is full', async () => {
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
        canInviteMember: vi.fn().mockResolvedValue(false),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Family plan has reached the maximum of 10 members');
    });

    it('should return 400 when email is already a member', async () => {
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
        canInviteMember: vi.fn().mockResolvedValue(true),
        getFamilyMembers: vi.fn().mockResolvedValue([
          { id: 'member-1', email: 'friend@example.com', role: 'member' },
        ]),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('This email is already a member of your family plan');
    });

    it('should return 400 when invitation already exists', async () => {
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
        canInviteMember: vi.fn().mockResolvedValue(true),
        getFamilyMembers: vi.fn().mockResolvedValue([]),
        getPendingInvitations: vi.fn().mockResolvedValue([
          { id: 'invite-1', inviteeEmail: 'friend@example.com', status: 'pending' },
        ]),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('An invitation has already been sent to this email');
    });

    it('should send invitation email and return success', async () => {
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
        canInviteMember: vi.fn().mockResolvedValue(true),
        getFamilyMembers: vi.fn().mockResolvedValue([]),
        getPendingInvitations: vi.fn().mockResolvedValue([]),
        createInvitation: vi.fn().mockResolvedValue({
          id: 'invite-123',
          family_plan_id: 'family-123',
          invitee_email: 'friend@example.com',
          invite_code: 'ABC123XY',
          status: 'pending',
          expires_at: '2025-01-08T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        }),
        createFamilyPlan: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const mockEmailService = {
        sendFamilyInvitation: vi.fn().mockResolvedValue({ success: true }),
        sendRenewalReminder: vi.fn(),
        isValidEmail: vi.fn().mockReturnValue(true),
        resend: {} as unknown,
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { getEmailService } = await import('@/lib/email');
      vi.mocked(getEmailService).mockReturnValue(mockEmailService as ReturnType<typeof getEmailService>);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.invitation).toBeDefined();
      expect(data.invitation.inviteeEmail).toBe('friend@example.com');
      expect(mockEmailService.sendFamilyInvitation).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/family/invite', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite?invitationId=invite-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when invitation ID is missing', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation ID is required');
    });

    it('should revoke invitation successfully', async () => {
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
        revokeInvitation: vi.fn().mockResolvedValue({
          success: true,
          message: 'Invitation revoked successfully',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite?invitationId=invite-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 when revoke fails', async () => {
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
        revokeInvitation: vi.fn().mockResolvedValue({
          success: false,
          message: 'Invitation not found',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        acceptInvitation: vi.fn(),
        removeMember: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { DELETE } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/invite?invitationId=invalid-id', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation not found');
    });
  });
});
