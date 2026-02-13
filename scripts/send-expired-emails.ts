/**
 * One-time script: Send trial-expired upgrade emails to all expired accounts
 * Usage: npx tsx scripts/send-expired-emails.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.env.HOME || '', 'www/bittorrented.com/media-streamer/.env') });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = `${process.env.EMAIL_FROM_NAME || 'BitTorrented'} <${process.env.EMAIL_FROM || 'support@bittorrented.com'}>`;
  const baseUrl = 'https://bittorrented.com';

  // Get all expired trial subscriptions
  const { data: expired, error } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .eq('status', 'expired')
    .eq('tier', 'trial');

  if (error) { console.error('Error:', error); return; }
  console.log(`Found ${expired?.length ?? 0} expired trial accounts`);

  if (!expired?.length) return;

  // Get user emails
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, { email: string; name?: string }>();
  for (const u of users?.users || []) {
    if (u.email) {
      userMap.set(u.id, {
        email: u.email,
        name: (u.user_metadata?.display_name as string) || undefined,
      });
    }
  }

  let sent = 0, errors = 0, skipped = 0;

  for (const sub of expired) {
    const user = userMap.get(sub.user_id);
    if (!user?.email) { skipped++; continue; }

    // Skip test accounts
    if (user.email.includes('+test') || user.email.includes('chovy.com')) {
      console.log(`  SKIP (test): ${user.email}`);
      skipped++;
      continue;
    }

    const name = user.name || 'there';

    if (dryRun) {
      console.log(`  DRY RUN: Would email ${user.email} (${name})`);
      sent++;
      continue;
    }

    try {
      const { error: emailError } = await resend.emails.send({
        from,
        to: user.email,
        subject: 'Your BitTorrented free trial has ended — upgrade to keep streaming',
        html: getEmailHtml(name, baseUrl),
      });

      if (emailError) {
        console.error(`  FAIL: ${user.email} — ${emailError.message}`);
        errors++;
      } else {
        console.log(`  SENT: ${user.email}`);
        sent++;
      }

      // Rate limit: 600ms between emails (Resend allows 2/sec)
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`  ERROR: ${user.email}`, err);
      errors++;
    }
  }

  console.log(`\nDone! Sent: ${sent}, Errors: ${errors}, Skipped: ${skipped}`);
}

function getEmailHtml(name: string, baseUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0a;color:#fff;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" style="max-width:600px;width:100%;border-collapse:collapse;">
<tr><td align="center" style="padding-bottom:30px;">
  <img src="${baseUrl}/logo.png" alt="BitTorrented" style="height:40px;width:auto;" />
</td></tr>
<tr><td style="background-color:#1a1a1a;border-radius:12px;padding:40px;">
  <h1 style="margin:0 0 20px;font-size:24px;font-weight:600;color:#fff;text-align:center;">Your Free Trial Has Ended</h1>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#a0a0a0;">Hi ${name},</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#a0a0a0;">Your 3-day free trial on BitTorrented has ended. Without an active subscription, you'll lose access to:</p>
  <ul style="margin:0 0 30px;padding-left:20px;color:#a0a0a0;">
    <li style="margin-bottom:10px;">🎬 Streaming movies and TV shows from torrents</li>
    <li style="margin-bottom:10px;">📺 Live TV (IPTV) channels</li>
    <li style="margin-bottom:10px;">🎵 Music streaming and downloads</li>
    <li style="margin-bottom:10px;">🎙️ Podcasts</li>
    <li style="margin-bottom:10px;">📖 eBook reader</li>
    <li style="margin-bottom:10px;">🎉 Watch parties with friends</li>
  </ul>
  <p style="margin:0 0 30px;font-size:16px;line-height:1.6;color:#a0a0a0;">
    Upgrade now to keep everything — plans start at just <strong style="color:#fff;">$4.99/year</strong>.
  </p>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:30px;">
    <tr>
      <td style="width:50%;padding-right:8px;vertical-align:top;">
        <div style="background-color:#2a2a2a;border-radius:8px;padding:20px;text-align:center;border:1px solid #333;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">Premium</p>
          <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#10b981;">$4.99</p>
          <p style="margin:0;font-size:13px;color:#666;">per year · 1 device</p>
        </div>
      </td>
      <td style="width:50%;padding-left:8px;vertical-align:top;">
        <div style="background-color:#2a2a2a;border-radius:8px;padding:20px;text-align:center;border:1px solid #10b981;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">Family</p>
          <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#10b981;">$9.99</p>
          <p style="margin:0;font-size:13px;color:#666;">per year · 5 devices</p>
        </div>
      </td>
    </tr>
  </table>
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center">
      <a href="${baseUrl}/pricing" style="display:inline-block;background-color:#10b981;color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;">Choose a Plan</a>
    </td></tr>
  </table>
  <p style="margin:30px 0 0;font-size:14px;color:#666;text-align:center;">Pay with crypto for complete privacy. No credit card required.</p>
</td></tr>
<tr><td style="padding-top:30px;text-align:center;">
  <p style="margin:0 0 10px;font-size:14px;color:#666;">Questions? Just reply to this email.</p>
  <p style="margin:0;font-size:12px;color:#444;">© ${new Date().getFullYear()} BitTorrented. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

main().catch(console.error);
