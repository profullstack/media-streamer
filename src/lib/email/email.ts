/**
 * Email Service
 * 
 * Handles sending emails using Resend for family invitations and renewal reminders
 */

import { Resend } from 'resend';

// ============================================================================
// Types
// ============================================================================

export interface EmailServiceConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  baseUrl: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface FamilyInvitationEmailParams {
  to: string;
  inviterName: string;
  inviterEmail: string;
  familyPlanName: string;
  inviteCode: string;
  expiresAt: Date;
}

export interface RenewalReminderEmailParams {
  to: string;
  daysRemaining: number;
  tier: 'premium' | 'family';
  expiresAt: Date;
  renewalUrl: string;
}

export interface EmailService {
  sendFamilyInvitation(params: FamilyInvitationEmailParams): Promise<EmailResult>;
  sendRenewalReminder(params: RenewalReminderEmailParams): Promise<EmailResult>;
  isValidEmail(email: string): boolean;
  resend: Resend;
}

// ============================================================================
// Constants
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// Email Templates
// ============================================================================

function getFamilyInvitationHtml(
  params: FamilyInvitationEmailParams,
  baseUrl: string
): string {
  const acceptUrl = `${baseUrl}/family/accept?code=${params.inviteCode}`;
  const expiresFormatted = params.expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Family Plan Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <img src="${baseUrl}/logo.png" alt="BitTorrented" style="height: 40px; width: auto;" />
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background-color: #1a1a1a; border-radius: 12px; padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
                You're Invited to Join a Family Plan! 🎉
              </h1>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #a0a0a0;">
                <strong style="color: #ffffff;">${params.inviterName}</strong> (${params.inviterEmail}) has invited you to join their family plan "<strong style="color: #ffffff;">${params.familyPlanName}</strong>" on BitTorrented.
              </p>
              
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #a0a0a0;">
                As a family member, you'll get full access to:
              </p>
              
              <ul style="margin: 0 0 30px; padding-left: 20px; color: #a0a0a0;">
                <li style="margin-bottom: 10px;">Stream any torrent</li>
                <li style="margin-bottom: 10px;">Live TV (IPTV)</li>
                <li style="margin-bottom: 10px;">Podcasts</li>
                <li style="margin-bottom: 10px;">Watch parties</li>
                <li style="margin-bottom: 10px;">Shared playlists</li>
                <li style="margin-bottom: 10px;">And much more!</li>
              </ul>
              
              <!-- Invite Code Box -->
              <div style="background-color: #2a2a2a; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 30px;">
                <p style="margin: 0 0 10px; font-size: 14px; color: #a0a0a0;">Your Invitation Code:</p>
                <p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #10b981; font-family: monospace;">
                  ${params.inviteCode}
                </p>
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${acceptUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; color: #666666; text-align: center;">
                This invitation expires on <strong style="color: #a0a0a0;">${expiresFormatted}</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 30px; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: #444444;">
                © ${new Date().getFullYear()} BitTorrented. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function getRenewalReminderHtml(
  params: RenewalReminderEmailParams,
  baseUrl: string
): string {
  const renewUrl = `${baseUrl}${params.renewalUrl}`;
  const expiresFormatted = params.expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const tierName = params.tier === 'family' ? 'Family' : 'Premium';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Renewal Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <img src="${baseUrl}/logo.png" alt="BitTorrented" style="height: 40px; width: auto;" />
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background-color: #1a1a1a; border-radius: 12px; padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
                Your Subscription Expires in ${params.daysRemaining} Day${params.daysRemaining === 1 ? '' : 's'}
              </h1>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #a0a0a0;">
                Your <strong style="color: #ffffff;">${tierName}</strong> subscription will expire on <strong style="color: #ffffff;">${expiresFormatted}</strong>.
              </p>
              
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #a0a0a0;">
                Renew now to keep enjoying:
              </p>
              
              <ul style="margin: 0 0 30px; padding-left: 20px; color: #a0a0a0;">
                <li style="margin-bottom: 10px;">Unlimited streaming</li>
                <li style="margin-bottom: 10px;">Live TV (IPTV)</li>
                <li style="margin-bottom: 10px;">Podcasts</li>
                <li style="margin-bottom: 10px;">Watch parties</li>
                ${params.tier === 'family' ? '<li style="margin-bottom: 10px;">Family sharing for up to 10 members</li>' : ''}
              </ul>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${renewUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 8px;">
                      Renew Subscription
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; color: #666666; text-align: center;">
                Pay with crypto for complete privacy. No credit card required.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 30px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #444444;">
                © ${new Date().getFullYear()} BitTorrented. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// ============================================================================
// Service Implementation
// ============================================================================

export function createEmailService(config: EmailServiceConfig): EmailService {
  const resend = new Resend(config.apiKey);
  const from = `${config.fromName} <${config.fromEmail}>`;

  function isValidEmail(email: string): boolean {
    return EMAIL_REGEX.test(email);
  }

  async function sendFamilyInvitation(
    params: FamilyInvitationEmailParams
  ): Promise<EmailResult> {
    // Validate inputs
    if (!isValidEmail(params.to)) {
      return { success: false, error: 'Invalid email address' };
    }

    if (!params.inviteCode || params.inviteCode.trim() === '') {
      return { success: false, error: 'Missing invite code' };
    }

    try {
      const html = getFamilyInvitationHtml(params, config.baseUrl);
      
      const { data, error } = await resend.emails.send({
        from,
        to: params.to,
        subject: `${params.inviterName} invited you to join their BitTorrented Family Plan`,
        html,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async function sendRenewalReminder(
    params: RenewalReminderEmailParams
  ): Promise<EmailResult> {
    // Validate inputs
    if (!isValidEmail(params.to)) {
      return { success: false, error: 'Invalid email address' };
    }

    try {
      const html = getRenewalReminderHtml(params, config.baseUrl);
      const tierName = params.tier === 'family' ? 'Family' : 'Premium';
      
      const { data, error } = await resend.emails.send({
        from,
        to: params.to,
        subject: `Your BitTorrented ${tierName} subscription expires in ${params.daysRemaining} day${params.daysRemaining === 1 ? '' : 's'}`,
        html,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  return {
    sendFamilyInvitation,
    sendRenewalReminder,
    isValidEmail,
    resend,
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || 'noreply@bittorrented.com';
    const fromName = process.env.EMAIL_FROM_NAME || 'BitTorrented';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bittorrented.com';

    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    emailServiceInstance = createEmailService({
      apiKey,
      fromEmail,
      fromName,
      baseUrl,
    });
  }

  return emailServiceInstance;
}

export function resetEmailService(): void {
  emailServiceInstance = null;
}
