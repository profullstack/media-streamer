-- Invite limits (Anthony, 2026-10-06): "the create should be a <dialog> that allows
-- me to set expiration date and/or number of uses allowed or none. works forever."
--
-- An invite may now carry an expiry (expires_at) and a use limit (max_uses). Null in
-- either means no limit, so an invite with neither works forever for any number of
-- signups. Invites made before this migration were single use and keep max_uses = 1.
--
-- The allowance is spent per use, not per invite: a member's invite for 3 people
-- costs 3 of their 5 a month, so the monthly cap still caps signups. Only admins
-- (p_unlimited) may make an invite with no use limit; create_invite() refuses it
-- for anyone else.
--
-- used_by / used_at now record the most recent signup; invite_redemptions keeps
-- every one.

alter table public.invites
  add column if not exists expires_at timestamptz,
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0),
  add column if not exists use_count integer not null default 0 check (use_count >= 0);

-- Existing invites: single use, and the ones already spent have been used once.
update public.invites
   set max_uses = 1,
       use_count = case when used_at is null then 0 else 1 end
 where max_uses is null and use_count = 0;

create table if not exists public.invite_redemptions (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

alter table public.invite_redemptions enable row level security;
revoke all on public.invite_redemptions from anon, authenticated;
grant all on public.invite_redemptions to service_role;

insert into public.invite_redemptions (invite_id, user_id, used_at)
select id, used_by, used_at from public.invites where used_by is not null and used_at is not null
on conflict do nothing;

-- Balance: 5 a month as before, but an invite costs one per allowed use.
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
  select coalesce(sum(coalesce(max_uses, 1)), 0) into v_made from public.invites where created_by = p_user;
  return greatest(5 * greatest(v_months, 1) - v_made, 0);
end;
$$;

drop function if exists public.create_invite(uuid, text, boolean);

create or replace function public.create_invite(
  p_user uuid,
  p_code text,
  p_unlimited boolean default false,
  p_max_uses integer default 1,
  p_expires_at timestamptz default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.invites;
begin
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'invite_bad_uses' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'invite_bad_expiry' using errcode = 'P0001';
  end if;
  -- One member's requests run one at a time, so parallel clicks cannot overspend.
  perform pg_advisory_xact_lock(hashtextextended('invite:' || p_user::text, 0));
  if not p_unlimited then
    if p_max_uses is null then
      raise exception 'invite_unlimited_uses_admin_only' using errcode = 'P0001';
    end if;
    if public.invite_balance(p_user) < p_max_uses then
      raise exception 'invite_allowance_exhausted' using errcode = 'P0001';
    end if;
  end if;
  insert into public.invites (code, created_by, max_uses, expires_at)
  values (public.normalize_invite_code(p_code), p_user, p_max_uses, p_expires_at)
  returning * into v_row;
  return v_row;
end;
$$;

-- Signup: the UPDATE takes the row lock, so racing signups cannot overrun max_uses.
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
     set use_count = use_count + 1, used_by = new.id, used_at = now()
   where code = v_code
     and (expires_at is null or expires_at > now())
     and (max_uses is null or use_count < max_uses)
  returning id into v_id;
  if v_id is null then
    raise exception 'invite_invalid: that invite code is unknown, expired or used up' using errcode = 'P0001';
  end if;
  insert into public.invite_redemptions (invite_id, user_id) values (v_id, new.id);
  return new;
end;
$$;

revoke all on function public.invite_balance(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.create_invite(uuid, text, boolean, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_invite_on_signup() from public, anon, authenticated;
grant execute on function public.invite_balance(uuid, timestamptz) to service_role;
grant execute on function public.create_invite(uuid, text, boolean, integer, timestamptz) to service_role;

notify pgrst, 'reload schema';
