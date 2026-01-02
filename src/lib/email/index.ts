/**
 * Email Module
 * 
 * Exports email service for sending family invitations and renewal reminders
 */

export {
  createEmailService,
  getEmailService,
  resetEmailService,
  type EmailService,
  type EmailServiceConfig,
  type EmailResult,
  type FamilyInvitationEmailParams,
  type RenewalReminderEmailParams,
} from './email';
