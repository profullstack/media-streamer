/**
 * The shared @profullstack/profile fields (email, first/last name, company
 * domain, job title, LinkedIn) for an account, in public.contact_profiles
 * keyed by the auth user id. Not public.user_profiles (public, holds the
 * username) and not public.profiles (Netflix-style sub-profiles).
 *
 * Server-only: the store uses the service-role client.
 */
import { createProfileStore, type ProfileStore } from '@profullstack/profile';
import { createServerClient } from '@/lib/supabase';

export function contactProfileStore(): ProfileStore {
  return createProfileStore(createServerClient(), { table: 'contact_profiles', key: 'user_id' });
}
