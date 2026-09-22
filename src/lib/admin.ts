import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getServerClient } from '@/lib/supabase';

type AnyClient = SupabaseClient<any>;

export type AdminCheck = {
  isAdmin: boolean;
  source: 'user_profiles' | 'admin_users' | null;
};

export async function checkUserAdmin(
  userId: string,
  client: AnyClient = getServerClient() as AnyClient
): Promise<AdminCheck> {
  const { data: profileAdmin } = await client
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('is_admin', true)
    .maybeSingle();

  if (profileAdmin) {
    return { isAdmin: true, source: 'user_profiles' };
  }

  const { data: legacyAdmin } = await client
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    isAdmin: Boolean(legacyAdmin),
    source: legacyAdmin ? 'admin_users' : null,
  };
}

export async function requireAdminUser(userId: string): Promise<boolean> {
  return (await checkUserAdmin(userId)).isAdmin;
}

export type AdminPageUser = { id: string; email: string };

/**
 * Page-level admin gate. Sends a logged-out visitor to /login (and back here
 * afterwards) and gives a signed-in non-admin a 404, so the console's
 * existence is not confirmed to anyone who is not on it.
 */
export async function requireAdminPage(redirectTo = '/admin'): Promise<AdminPageUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  if (!(await requireAdminUser(user.id))) notFound();
  return { id: user.id, email: user.email };
}

/**
 * Grant or revoke admin. Writes the user_profiles flag when the account has a
 * profile row, and always mirrors into the legacy admin_users table so both
 * paths checkUserAdmin() reads stay in agreement.
 */
export async function setUserAdmin(
  userId: string,
  isAdmin: boolean,
  client: AnyClient = getServerClient() as AnyClient
): Promise<void> {
  const { error: profileError } = await client
    .from('user_profiles')
    .update({ is_admin: isAdmin, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (profileError) throw new Error(profileError.message);

  if (isAdmin) {
    const { error } = await client.from('admin_users').upsert({ user_id: userId }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await client.from('admin_users').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

export async function listAuthUserEmails(client: AnyClient = getServerClient() as AnyClient): Promise<string[]> {
  const emails = new Set<string>();
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return Array.from(emails).sort();
}

export async function findAuthUserByEmail(
  email: string,
  client: AnyClient = getServerClient() as AnyClient
): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.trim().toLowerCase() === target);
    if (match?.email) return { id: match.id, email: match.email };

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}
