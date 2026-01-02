/**
 * Family Invitation Accept API Route Tests
 * 
 * Tests for the family invitation acceptance API endpoint
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

describe('Family Accept API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/family/accept', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: 'ABC123XY' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when invite code is missing', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invite code is required');
    });

    it('should return 400 when invite code is empty', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: '   ' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invite code is required');
    });

    it('should return 400 when user is already in a family plan', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-existing',
          ownerId: 'user-123',
          ownerEmail: 'test@example.com',
          userRole: 'owner',
          planName: 'Existing Family',
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
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: 'ABC123XY' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('You are already a member of a family plan');
    });

    it('should return 400 when invitation is invalid', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue(null),
        acceptInvitation: vi.fn().mockResolvedValue({
          success: false,
          message: 'Invalid or expired invitation code',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: 'INVALID' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired invitation code');
    });

    it('should accept invitation successfully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-new',
        email: 'newmember@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn()
          .mockResolvedValueOnce(null) // First call: check if user is in a family
          .mockResolvedValueOnce({ // Second call: get the joined family
            familyPlanId: 'family-123',
            ownerId: 'user-owner',
            ownerEmail: 'owner@example.com',
            userRole: 'member',
            planName: 'Test Family',
            maxMembers: 10,
            createdAt: '2025-01-01T00:00:00Z',
          }),
        acceptInvitation: vi.fn().mockResolvedValue({
          success: true,
          message: 'Successfully joined the family plan',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: 'ABC123XY' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Successfully joined the family plan');
      expect(data.familyPlan).toBeDefined();
    });

    it('should normalize invite code to uppercase', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-new',
        email: 'newmember@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            familyPlanId: 'family-123',
            ownerId: 'user-owner',
            ownerEmail: 'owner@example.com',
            userRole: 'member',
            planName: 'Test Family',
            maxMembers: 10,
            createdAt: '2025-01-01T00:00:00Z',
          }),
        acceptInvitation: vi.fn().mockResolvedValue({
          success: true,
          message: 'Successfully joined the family plan',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
        createFamilyPlan: vi.fn(),
        createInvitation: vi.fn(),
        getInvitationByCode: vi.fn(),
        removeMember: vi.fn(),
        revokeInvitation: vi.fn(),
        canInviteMember: vi.fn(),
        getFamilyOwnerId: vi.fn(),
      };

      const { getFamilyPlanRepository } = await import('@/lib/family');
      vi.mocked(getFamilyPlanRepository).mockReturnValue(mockFamilyRepo);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family/accept', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: 'abc123xy' }),
      });
      await POST(request);

      expect(mockFamilyRepo.acceptInvitation).toHaveBeenCalledWith(
        'ABC123XY',
        'user-new',
        'newmember@example.com'
      );
    });
  });
});
