import type { SupabaseClient } from '@supabase/supabase-js';
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
