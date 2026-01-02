/**
 * Family Plan API Route Tests
 * 
 * Tests for the family plan management API endpoints
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

// Mock the email service
vi.mock('@/lib/email', () => ({
  getEmailService: vi.fn(),
}));

describe('Family Plan API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/family', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('./route');
      const request = new NextRequest('http://localhost/api/family');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return family plan info for authenticated user', async () => {
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
          role: 'owner',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        getFamilyMembers: vi.fn().mockResolvedValue([
          {
            id: 'member-1',
            userId: 'user-123',
            email: 'test@example.com',
            role: 'owner',
            joinedAt: '2025-01-01T00:00:00Z',
          },
        ]),
        getPendingInvitations: vi.fn().mockResolvedValue([]),
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
      const request = new NextRequest('http://localhost/api/family');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.familyPlan).toBeDefined();
      expect(data.familyPlan.familyPlanId).toBe('family-123');
      expect(data.members).toHaveLength(1);
      expect(data.pendingInvitations).toHaveLength(0);
    });

    it('should return null when user has no family plan', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-no-family',
        email: 'nofamily@example.com',
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
      const request = new NextRequest('http://localhost/api/family');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.familyPlan).toBeNull();
    });
  });

  describe('POST /api/family', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { POST } = await import('./route');
      const request = new NextRequest('http://localhost/api/family', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should create a family plan for authenticated user', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const mockFamilyRepo = {
        getFamilyPlan: vi.fn().mockResolvedValue(null),
        createFamilyPlan: vi.fn().mockResolvedValue({
          familyPlanId: 'family-new',
          ownerId: 'user-123',
          ownerEmail: 'test@example.com',
          role: 'owner',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
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
      const request = new NextRequest('http://localhost/api/family', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.familyPlan).toBeDefined();
      expect(data.familyPlan.familyPlanId).toBe('family-new');
    });

    it('should return 400 when user already has a family plan', async () => {
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
          role: 'owner',
          maxMembers: 10,
          createdAt: '2025-01-01T00:00:00Z',
        }),
        createFamilyPlan: vi.fn(),
        getFamilyMembers: vi.fn(),
        getPendingInvitations: vi.fn(),
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
      const request = new NextRequest('http://localhost/api/family', {
        method: 'POST',
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('You are already a member of a family plan');
    });
  });
});
