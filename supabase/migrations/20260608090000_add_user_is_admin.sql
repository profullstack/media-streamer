-- Account-level admin flag for app admin access.
-- Keep admin_users as a legacy fallback, but mirror existing admins here.

alter table public.user_profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists idx_user_profiles_is_admin
  on public.user_profiles(user_id)
  where is_admin = true;

update public.user_profiles up
set is_admin = true,
    updated_at = now()
from public.admin_users au
where up.user_id = au.user_id
  and up.is_admin = false;
