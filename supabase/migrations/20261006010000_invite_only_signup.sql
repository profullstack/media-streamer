-- Invite-only signup (Anthony, 2026-10-06).
--
-- Every new account needs an unused invite code. The code travels in the signup
-- metadata (raw_user_meta_data.invite_code) and is consumed by a trigger on
-- auth.users, so the rule holds for every way an account can be made: our
-- /api/auth/signup route, a direct GoTrue /auth/v1/signup with the anon key,
-- OAuth, magic links and auth.admin.createUser alike. The trigger runs in the
-- same transaction as the insert, so a missing, unknown or already used code
-- aborts the signup and two signups racing for one code cannot both win.
--
-- Each member may create 5 invites a month; unused ones carry over. The count
-- starts in October 2026 (when invites began), not at account creation, so an
-- old account does not open with a bank of invites. Admins have no limit; the
-- caller passes p_unlimited after checking checkUserAdmin.

create table if not exists public.invites (
  id uuid primary key default extensions.uuid_generate_v4(),
  -- Normalised: upper case, letters and digits only (no dash).
  code text not null unique check (code ~ '^[A-Z0-9]{10}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create index if not exists invites_created_by_idx on public.invites (created_by, created_at desc);

-- Only the service role (our API routes) reads or writes invites.
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

create or replace function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- Invites a member may still create: 5 for every month from October 2026 (or
-- from the month they joined, if later) through this one, less those made.
-- p_now exists so tests can ask about a later month.
create or replace function public.invite_balance(p_user uuid, p_now timestamptz default now())
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_joined timestamptz;
  v_from date;
  v_months integer;
  v_made integer;
begin
  select created_at into v_joined from auth.users where id = p_user;
  if v_joined is null then
    return 0;
  end if;
  v_from := greatest(date_trunc('month', v_joined at time zone 'utc'), date '2026-10-01');
  v_months := (extract(year from p_now at time zone 'utc')::int * 12 + extract(month from p_now at time zone 'utc')::int)
            - (extract(year from v_from)::int * 12 + extract(month from v_from)::int) + 1;
  select count(*) into v_made from public.invites where created_by = p_user;
  return greatest(5 * greatest(v_months, 1) - v_made, 0);
end;
$$;

create or replace function public.create_invite(p_user uuid, p_code text, p_unlimited boolean default false)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.invites;
begin
  -- One member's requests run one at a time, so parallel clicks cannot overspend.
  perform pg_advisory_xact_lock(hashtextextended('invite:' || p_user::text, 0));
  if not p_unlimited and public.invite_balance(p_user) <= 0 then
    raise exception 'invite_allowance_exhausted' using errcode = 'P0001';
  end if;
  insert into public.invites (code, created_by)
  values (public.normalize_invite_code(p_code), p_user)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.consume_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code');
  v_id uuid;
begin
  if v_code = '' then
    raise exception 'invite_required: an invite code is required to sign up' using errcode = 'P0001';
  end if;
  update public.invites
     set used_by = new.id, used_at = now()
   where code = v_code and used_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'invite_invalid: that invite code is unknown or already used' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists a_consume_invite_on_signup on auth.users;
create trigger a_consume_invite_on_signup
  after insert on auth.users
  for each row execute function public.consume_invite_on_signup();

revoke all on function public.invite_balance(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.create_invite(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.consume_invite_on_signup() from public, anon, authenticated;
grant execute on function public.invite_balance(uuid, timestamptz) to service_role;
grant execute on function public.create_invite(uuid, text, boolean) to service_role;
grant all on public.invites to service_role;
