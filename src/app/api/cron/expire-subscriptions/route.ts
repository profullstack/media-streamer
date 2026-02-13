/**
 * POST /api/cron/expire-subscriptions
 *
 * Expires stale trial and paid subscriptions, sends upgrade emails.
 * Called periodically by an external cron job.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/client';
import { getEmailService } from '@/lib/email';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServerClient();

  try {
    // 1. Find active trials that have expired (not yet marked as expired)
    const { data: expiredTrials, error: trialError } = await supabase
      .from('user_subscriptions')
      .select('user_id, trial_expires_at')
      .eq('tier', 'trial')
      .eq('status', 'active')
      .lt('trial_expires_at', new Date().toISOString());

    if (trialError) {
      console.error('[expire-subscriptions] Error fetching expired trials:', trialError);
      return NextResponse.json({ error: trialError.message }, { status: 500 });
    }

    // 2. Find active paid subscriptions that have expired
    const { data: expiredPaid, error: paidError } = await supabase
      .from('user_subscriptions')
      .select('user_id, subscription_expires_at, tier')
      .in('tier', ['premium', 'family'])
      .eq('status', 'active')
      .lt('subscription_expires_at', new Date().toISOString());

    if (paidError) {
      console.error('[expire-subscriptions] Error fetching expired paid:', paidError);
    }

    const allExpiredUserIds = [
      ...(expiredTrials || []).map(t => t.user_id),
      ...(expiredPaid || []).map(t => t.user_id),
    ];

    // 3. Mark all as expired
    if (allExpiredUserIds.length > 0) {
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('user_id', allExpiredUserIds);

      if (updateError) {
        console.error('[expire-subscriptions] Error updating status:', updateError);
      }
    }

    // 4. Send trial-expired emails (only for trials, not renewals — those use renewal reminders)
    let emailsSent = 0;
    let emailErrors = 0;

    if (expiredTrials && expiredTrials.length > 0) {
      // Get user emails and names
      const { data: users } = await supabase.auth.admin.listUsers();
      const userMap = new Map<string, { email: string; name?: string }>();
      if (users?.users) {
        for (const u of users.users) {
          if (u.email) {
            userMap.set(u.id, {
              email: u.email,
              name: (u.user_metadata?.display_name as string) || undefined,
            });
          }
        }
      }

      let emailService: ReturnType<typeof getEmailService> | null = null;
      try {
        emailService = getEmailService();
      } catch {
        console.error('[expire-subscriptions] Email service not configured');
      }

      if (emailService) {
        for (const trial of expiredTrials) {
          const user = userMap.get(trial.user_id);
          if (!user?.email) continue;

          try {
            const result = await emailService.sendTrialExpired({
              to: user.email,
              userName: user.name,
            });
            if (result.success) {
              emailsSent++;
              console.log(`[expire-subscriptions] Sent trial-expired email to ${user.email}`);
            } else {
              emailErrors++;
              console.error(`[expire-subscriptions] Failed to send email to ${user.email}:`, result.error);
            }
          } catch (err) {
            emailErrors++;
            console.error(`[expire-subscriptions] Email error for ${user.email}:`, err);
          }
        }
      }
    }

    const result = {
      ok: true,
      trialsExpired: expiredTrials?.length ?? 0,
      paidExpired: expiredPaid?.length ?? 0,
      emailsSent,
      emailErrors,
      timestamp: new Date().toISOString(),
    };

    console.log('[expire-subscriptions]', result);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[expire-subscriptions] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
