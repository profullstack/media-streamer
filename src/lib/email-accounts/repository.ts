import { createServerClient } from '@/lib/supabase';
import type {
  CreateEmailAccountInput,
  EmailAccount,
  PublicEmailAccount,
  UpdateEmailAccountInput,
} from './types';

const TABLE = 'email_accounts';

interface EmailAccountRow {
  id: string;
  user_id: string;
  label: string;
  provider: string | null;
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_security: 'none' | 'starttls' | 'tls';
  smtp_username: string | null;
  smtp_password: string;
  is_default: boolean;
  last_checked_at: string | null;
  last_check_status: 'unchecked' | 'success' | 'failed';
  last_check_error: string | null;
  created_at: string;
  updated_at: string;
}

function db() {
  return createServerClient();
}

function rowToAccount(row: EmailAccountRow): EmailAccount {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    provider: row.provider,
    fromEmail: row.from_email,
    fromName: row.from_name,
    replyToEmail: row.reply_to_email,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security,
    smtpUsername: row.smtp_username,
    smtpPassword: row.smtp_password,
    isDefault: row.is_default,
    lastCheckedAt: row.last_checked_at,
    lastCheckStatus: row.last_check_status,
    lastCheckError: row.last_check_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicEmailAccount(account: EmailAccount): PublicEmailAccount {
  return {
    id: account.id,
    label: account.label,
    provider: account.provider,
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    replyToEmail: account.replyToEmail,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecurity: account.smtpSecurity,
    smtpUsername: account.smtpUsername,
    isDefault: account.isDefault,
    lastCheckedAt: account.lastCheckedAt,
    lastCheckStatus: account.lastCheckStatus,
    lastCheckError: account.lastCheckError,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function listEmailAccounts(userId: string): Promise<EmailAccount[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list email accounts: ${error.message}`);
  return ((data ?? []) as EmailAccountRow[]).map(rowToAccount);
}

export async function getEmailAccount(userId: string, accountId: string): Promise<EmailAccount | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get email account: ${error.message}`);
  return data ? rowToAccount(data as EmailAccountRow) : null;
}

async function shouldMakeDefault(userId: string, requestedDefault: boolean | undefined): Promise<boolean> {
  if (requestedDefault) return true;

  const { count, error } = await db()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to count email accounts: ${error.message}`);
  return (count ?? 0) === 0;
}

export async function createEmailAccount(
  userId: string,
  input: CreateEmailAccountInput
): Promise<EmailAccount> {
  const isDefault = await shouldMakeDefault(userId, input.isDefault);
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      user_id: userId,
      label: input.label,
      provider: input.provider ?? null,
      from_email: input.fromEmail,
      from_name: input.fromName ?? null,
      reply_to_email: input.replyToEmail ?? null,
      smtp_host: input.smtpHost,
      smtp_port: input.smtpPort,
      smtp_security: input.smtpSecurity,
      smtp_username: input.smtpUsername ?? null,
      smtp_password: input.smtpPassword,
      is_default: isDefault,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create email account: ${error?.message ?? 'no data'}`);
  }

  return rowToAccount(data as EmailAccountRow);
}

export async function updateEmailAccount(
  userId: string,
  accountId: string,
  input: UpdateEmailAccountInput
): Promise<EmailAccount> {
  const update: Record<string, unknown> = {};
  if (input.label !== undefined) update.label = input.label;
  if (input.provider !== undefined) update.provider = input.provider;
  if (input.fromEmail !== undefined) update.from_email = input.fromEmail;
  if (input.fromName !== undefined) update.from_name = input.fromName;
  if (input.replyToEmail !== undefined) update.reply_to_email = input.replyToEmail;
  if (input.smtpHost !== undefined) update.smtp_host = input.smtpHost;
  if (input.smtpPort !== undefined) update.smtp_port = input.smtpPort;
  if (input.smtpSecurity !== undefined) update.smtp_security = input.smtpSecurity;
  if (input.smtpUsername !== undefined) update.smtp_username = input.smtpUsername;
  if (input.smtpPassword !== undefined) update.smtp_password = input.smtpPassword;
  if (input.isDefault !== undefined) update.is_default = input.isDefault;

  const { data, error } = await db()
    .from(TABLE)
    .update(update)
    .eq('user_id', userId)
    .eq('id', accountId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update email account: ${error?.message ?? 'no data'}`);
  }

  return rowToAccount(data as EmailAccountRow);
}

export async function deleteEmailAccount(userId: string, accountId: string): Promise<void> {
  const target = await getEmailAccount(userId, accountId);
  if (!target) return;

  const { error } = await db()
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', accountId);

  if (error) throw new Error(`Failed to delete email account: ${error.message}`);

  if (target.isDefault) {
    const remaining = await listEmailAccounts(userId);
    if (remaining.length > 0) {
      await updateEmailAccount(userId, remaining[0].id, { isDefault: true });
    }
  }
}

export async function updateEmailAccountCheckStatus(
  userId: string,
  accountId: string,
  success: boolean,
  errorMessage?: string
): Promise<EmailAccount> {
  const { data, error } = await db()
    .from(TABLE)
    .update({
      last_checked_at: new Date().toISOString(),
      last_check_status: success ? 'success' : 'failed',
      last_check_error: success ? null : (errorMessage ?? 'SMTP check failed').slice(0, 1000),
    })
    .eq('user_id', userId)
    .eq('id', accountId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update email account check status: ${error?.message ?? 'no data'}`);
  }

  return rowToAccount(data as EmailAccountRow);
}
