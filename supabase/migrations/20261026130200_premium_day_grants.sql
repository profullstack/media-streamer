-- Premium days: what a credit code and an accepted invite give.
--
-- Anthony, 2026-10-26: "mint him a token i can give him to redeem credits ... add credit code
-- redemptions and invite codes/(affiliate) to all properties".
--
-- A redeemed @profullstack/redeem-credits code (unit premium_days) and an accepted invite both
-- land on public.user_subscriptions, the row a paid Premium plan already lives on
-- (activate_subscription), so every check that reads Premium sees them with no new flag.
--
-- grant_premium_days(user, days, source) is idempotent on (user, source): a retried hook or a
-- second sign-in never adds the days twice. Days go on the end of whatever the member already
-- has: the end of a paid plan, or the end of a running trial. A Family plan stays Family.
--
-- grant_invite_bonus(user, ...) runs at sign-in. Once the new member has confirmed their email
-- and is not banned, it gives them the welcome days and their inviter the reward days, the
-- inviter at most p_inviter_monthly_cap times a calendar month (UTC). An admin-seeded invite
-- (created_by null) has no inviter to reward. Only invites accepted from p_since (the launch,
-- 2026-10-26) count: members who joined before the bonus existed are not paid out retroactively.

create table if not exists public.premium_day_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  days integer not null check (days > 0),
  source text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source)
);

create index if not exists premium_day_grants_source_idx on public.premium_day_grants (source);

alter table public.premium_day_grants enable row level security;
revoke all on table public.premium_day_grants from anon, authenticated;

-- Returns the new Premium expiry, or null when (user, source) was already granted.
create or replace function public.grant_premium_days(p_user_id uuid, p_days integer, p_source text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.user_subscriptions;
  v_from timestamptz;
  v_end timestamptz;
  v_inserted uuid;
  v_has boolean;
begin
  if p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'premium_days_out_of_range';
  end if;
  if p_source is null or length(p_source) = 0 then
    raise exception 'premium_days_source_required';
  end if;

  insert into public.premium_day_grants (user_id, days, source)
  values (p_user_id, p_days, p_source)
  on conflict (user_id, source) do nothing
  returning id into v_inserted;
  if v_inserted is null then
    return null;
  end if;

  select * into v_sub from public.user_subscriptions where user_id = p_user_id for update;
  v_has := found;

  -- Start from the latest time the member is already covered until: a paid plan's end,
  -- or a running trial's end, so a gift never eats time they already had.
  v_from := now();
  if v_has then
    if v_sub.tier in ('premium', 'family') and v_sub.status = 'active'
       and v_sub.subscription_expires_at is not null and v_sub.subscription_expires_at > v_from then
      v_from := v_sub.subscription_expires_at;
    elsif v_sub.tier = 'trial' and v_sub.status = 'active'
       and v_sub.trial_expires_at is not null and v_sub.trial_expires_at > v_from then
      v_from := v_sub.trial_expires_at;
    end if;
  end if;
  v_end := v_from + make_interval(days => p_days);

  if v_has then
    update public.user_subscriptions
    set tier = case when v_sub.tier = 'family' and v_sub.subscription_expires_at > now() then 'family' else 'premium' end,
        status = 'active',
        subscription_started_at = coalesce(subscription_started_at, now()),
        subscription_expires_at = v_end,
        renewal_reminder_7d_sent = false,
        renewal_reminder_3d_sent = false,
        renewal_reminder_1d_sent = false,
        updated_at = now()
    where user_id = p_user_id;
  else
    insert into public.user_subscriptions (user_id, tier, status, subscription_started_at, subscription_expires_at)
    values (p_user_id, 'premium', 'active', now(), v_end);
  end if;

  return v_end;
end;
$$;

-- Returns {invitee: expiry|null, inviter: expiry|null, inviter_id, reason}.
create or replace function public.grant_invite_bonus(
  p_user_id uuid,
  p_invitee_days integer,
  p_inviter_days integer,
  p_inviter_monthly_cap integer,
  p_since timestamptz default '2026-10-26 00:00:00+00'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
  v_invite_id uuid;
  v_inviter uuid;
  v_invitee_end timestamptz;
  v_inviter_end timestamptz;
  v_this_month integer;
begin
  if exists (select 1 from public.premium_day_grants where user_id = p_user_id and source = 'invite:welcome') then
    return jsonb_build_object('reason', 'already_granted');
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('reason', 'no_user');
  end if;
  if v_user.email_confirmed_at is null then
    return jsonb_build_object('reason', 'unconfirmed');
  end if;
  if v_user.banned_until is not null and v_user.banned_until > now() then
    return jsonb_build_object('reason', 'banned');
  end if;

  select r.invite_id, i.created_by into v_invite_id, v_inviter
  from public.invite_redemptions r
  join public.invites i on i.id = r.invite_id
  where r.user_id = p_user_id
    and r.used_at >= p_since
  order by r.used_at
  limit 1;
  if v_invite_id is null then
    return jsonb_build_object('reason', 'not_invited');
  end if;

  v_invitee_end := public.grant_premium_days(p_user_id, p_invitee_days, 'invite:welcome');

  if v_inviter is not null and v_inviter <> p_user_id and p_inviter_days > 0 then
    -- One reward month at a time per inviter, so parallel sign-ins cannot pass the cap together.
    perform pg_advisory_xact_lock(hashtext('invite_reward:' || v_inviter::text));
    select count(*) into v_this_month
    from public.premium_day_grants
    where user_id = v_inviter
      and source like 'invite:reward:%'
      and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
    if v_this_month < p_inviter_monthly_cap then
      v_inviter_end := public.grant_premium_days(v_inviter, p_inviter_days, 'invite:reward:' || p_user_id::text);
    end if;
  end if;

  return jsonb_build_object(
    'reason', 'granted',
    'invitee', v_invitee_end,
    'inviter', v_inviter_end,
    'inviter_id', v_inviter
  );
end;
$$;

revoke all on function public.grant_premium_days(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.grant_invite_bonus(uuid, integer, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_premium_days(uuid, integer, text) to service_role;
grant execute on function public.grant_invite_bonus(uuid, integer, integer, integer, timestamptz) to service_role;

notify pgrst, 'reload schema';
