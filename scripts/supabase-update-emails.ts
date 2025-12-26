#!/usr/bin/env npx tsx

/**
 * Supabase Email Templates Update Script
 * 
 * Updates Supabase Auth email templates using the Management API.
 * 
 * Usage:
 *   pnpm tsx scripts/supabase-update-emails.ts
 * 
 * Required environment variables:
 *   - SUPABASE_PROJECT_REF: Your Supabase project reference (from URL)
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 * 
 * Note: This script requires the Supabase Management API access token.
 * You can get this from: https://supabase.com/dashboard/account/tokens
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Email template types supported by Supabase
type EmailTemplateType = 
  | 'confirmation'
  | 'recovery'
  | 'magic_link'
  | 'invite';

interface EmailTemplate {
  type: EmailTemplateType;
  subject: string;
  contentPath: string;
}

// Template configuration
const templates: EmailTemplate[] = [
  {
    type: 'confirmation',
    subject: 'Confirm your email - BitTorrented',
    contentPath: 'supabase/email-templates/confirm-signup.html',
  },
  {
    type: 'recovery',
    subject: 'Reset your password - BitTorrented',
    contentPath: 'supabase/email-templates/reset-password.html',
  },
  {
    type: 'magic_link',
    subject: 'Sign in to BitTorrented',
    contentPath: 'supabase/email-templates/magic-link.html',
  },
  {
    type: 'invite',
    subject: "You're invited to BitTorrented!",
    contentPath: 'supabase/email-templates/invite-user.html',
  },
];

async function updateEmailTemplate(
  projectRef: string,
  accessToken: string,
  template: EmailTemplate
): Promise<void> {
  const templatePath = join(__dirname, '..', template.contentPath);
  const content = readFileSync(templatePath, 'utf-8');

  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  
  // Build the update payload based on template type
  const payload: Record<string, unknown> = {};
  
  switch (template.type) {
    case 'confirmation':
      payload.mailer_templates_confirmation_content = content;
      payload.mailer_templates_confirmation_subject = template.subject;
      break;
    case 'recovery':
      payload.mailer_templates_recovery_content = content;
      payload.mailer_templates_recovery_subject = template.subject;
      break;
    case 'magic_link':
      payload.mailer_templates_magic_link_content = content;
      payload.mailer_templates_magic_link_subject = template.subject;
      break;
    case 'invite':
      payload.mailer_templates_invite_content = content;
      payload.mailer_templates_invite_subject = template.subject;
      break;
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update ${template.type} template: ${error}`);
  }

  console.log(`✓ Updated ${template.type} template`);
}

async function main(): Promise<void> {
  console.log('🚀 Supabase Email Templates Update Script\n');

  // Get required environment variables
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectRef) {
    console.error('❌ Error: SUPABASE_PROJECT_REF environment variable is required');
    console.error('   You can find this in your Supabase project URL:');
    console.error('   https://supabase.com/dashboard/project/<PROJECT_REF>');
    process.exit(1);
  }

  if (!accessToken) {
    console.error('❌ Error: SUPABASE_ACCESS_TOKEN environment variable is required');
    console.error('   Generate one at: https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }

  console.log(`📦 Project: ${projectRef}`);
  console.log(`📧 Updating ${templates.length} email templates...\n`);

  try {
    for (const template of templates) {
      await updateEmailTemplate(projectRef, accessToken, template);
    }

    console.log('\n✅ All email templates updated successfully!');
    console.log('\n📝 Note: You can verify the templates in the Supabase dashboard:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/auth/templates`);
  } catch (error) {
    console.error('\n❌ Error updating templates:', error);
    process.exit(1);
  }
}

main();
