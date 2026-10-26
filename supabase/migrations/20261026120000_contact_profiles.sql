-- The shared @profullstack/profile fields (email, first_name, last_name,
-- company_domain, job_title, linkedin_url) in their own private table.
--
-- Why not public.user_profiles: it is readable by anyone when is_public
-- ("Public profiles are readable"), so an email column there would publish
-- every address, and its username is NOT NULL with no default, which the
-- package's upsert cannot satisfy. public.profiles is the per-account
-- sub-profile list (Netflix style), not a person. This table is service-role
-- only: RLS on, no policies, no anon/authenticated grants.
--
-- No backfill: user_profiles.display_name holds handles, not names.
--
-- Apply by hand on dev2 (the deploy never runs migrations):
--   docker exec -i bittorrented-com-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';
-- Additive and idempotent, so it is safe before the deploy.

create table if not exists public.contact_profiles (
  "user_id" uuid primary key references auth.users (id) on delete cascade,
  "email" text,
  "first_name" text,
  "last_name" text,
  "company_domain" text,
  "job_title" text,
  "linkedin_url" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "contact_profiles_email" on public.contact_profiles (lower("email"));
create index if not exists "contact_profiles_company_domain" on public.contact_profiles ("company_domain");

alter table public.contact_profiles enable row level security;
revoke all on public.contact_profiles from anon, authenticated;
