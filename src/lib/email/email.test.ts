/**
 * Email Service Tests
 * 
 * Tests for the Resend email service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEmailService,
  type EmailService,
  type FamilyInvitationEmailParams,
} from './email';

// Create mock send function at module level so it's shared across all tests
const mockSend = vi.fn();

// Mock Resend - the mock function is shared across all instances
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

describe('Email Service', () => {
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
    
    // Create service with mocked Resend
    emailService = createEmailService({
      apiKey: 'test-api-key',
      fromEmail: 'noreply@bittorrented.com',
      fromName: 'BitTorrented',
      baseUrl: 'https://bittorrented.com',
    });
  });

  describe('sendFamilyInvitation', () => {
    const validParams: FamilyInvitationEmailParams = {
      to: 'invitee@example.com',
      inviterName: 'John Doe',
      inviterEmail: 'john@example.com',
      familyPlanName: 'Doe Family',
      inviteCode: 'ABC12345',
      expiresAt: new Date('2026-01-09T12:00:00Z'),
    };

    it('should send family invitation email with correct parameters', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-123' }, error: null });
      
      const result = await emailService.sendFamilyInvitation(validParams);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-123');
    });

    it('should include invite code in the email', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-123' }, error: null });
      
      await emailService.sendFamilyInvitation(validParams);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.to).toBe(validParams.to);
      expect(callArgs.html).toContain(validParams.inviteCode);
    });

    it('should include inviter information in the email', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-123' }, error: null });
      
      await emailService.sendFamilyInvitation(validParams);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain(validParams.inviterName);
      expect(callArgs.html).toContain(validParams.familyPlanName);
    });

    it('should include accept invitation link', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-123' }, error: null });
      
      await emailService.sendFamilyInvitation(validParams);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('/family/accept');
      expect(callArgs.html).toContain(validParams.inviteCode);
    });

    it('should return error when Resend fails', async () => {
      mockSend.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Rate limit exceeded' } 
      });
      
      const result = await emailService.sendFamilyInvitation(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await emailService.sendFamilyInvitation(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should validate email address format', async () => {
      const invalidParams = { ...validParams, to: 'invalid-email' };
      
      const result = await emailService.sendFamilyInvitation(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email');
    });

    it('should validate invite code is not empty', async () => {
      const invalidParams = { ...validParams, inviteCode: '' };
      
      const result = await emailService.sendFamilyInvitation(invalidParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('invite code');
    });
  });

  describe('sendRenewalReminder', () => {
    const validParams = {
      to: 'user@example.com',
      daysRemaining: 7,
      tier: 'premium' as const,
      expiresAt: new Date('2026-01-09T12:00:00Z'),
      renewalUrl: '/pricing',
    };

    it('should send renewal reminder email', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-456' }, error: null });
      
      const result = await emailService.sendRenewalReminder(validParams);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-456');
    });

    it('should include days remaining in subject', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-456' }, error: null });
      
      await emailService.sendRenewalReminder(validParams);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.subject).toContain('7');
    });

    it('should include renewal link', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-456' }, error: null });
      
      await emailService.sendRenewalReminder(validParams);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('/pricing');
    });
  });

  describe('Email validation', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.org',
        'user+tag@example.co.uk',
      ];

      for (const email of validEmails) {
        expect(emailService.isValidEmail(email)).toBe(true);
      }
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid',
        '@example.com',
        'user@',
        'user@.com',
        '',
      ];

      for (const email of invalidEmails) {
        expect(emailService.isValidEmail(email)).toBe(false);
      }
    });
  });
});
