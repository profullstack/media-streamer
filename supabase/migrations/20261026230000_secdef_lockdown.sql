-- Lock down SECURITY DEFINER functions and privileged columns (2026-10-26 audit).
--
-- Supabase grants EXECUTE to PUBLIC on every new function, so all 54 SECURITY
-- DEFINER functions in public were callable with the anon key, none of them
-- checking auth.uid(): activate_subscription(any user, any tier, any months),
-- admin_list_users / admin_platform_stats (every user's email and stats),
-- get_subscriptions_needing_reminders (emails), family-plan functions that take
-- the requester id as a parameter, rss_* reading lists by profile id,
-- get_active_iptv_subscription, refresh_dht_torrent_count (a scan of the
-- 19M-row DHT index), and more.
--
-- The app calls every RPC from the server with the service role (the browser
-- never talks to PostgREST), so all of them become service-role only.
-- After this migration a NEW function needs an explicit GRANT EXECUTE to
-- anon/authenticated if anything other than the server must call it.

-- 1. Every SECURITY DEFINER function in public: service role only.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 2. New functions are not executable by PUBLIC/anon/authenticated by default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Pin privileged columns for direct (PostgREST) writes. current_user is
--    anon/authenticated only for direct requests with a user's JWT; the app's
--    server writes as service_role and definer functions run as the owner.

-- 3a. user_profiles.is_admin gates /admin; counters are trigger-maintained.
create or replace function public.protect_user_profile_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.comment_count := 0;
      new.favorite_count := 0;
    else
      new.id := old.id;
      new.user_id := old.user_id;
      new.is_admin := old.is_admin;
      new.comment_count := old.comment_count;
      new.favorite_count := old.favorite_count;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_user_profile on public.user_profiles;
create trigger trg_protect_user_profile before insert or update on public.user_profiles
  for each row execute function public.protect_user_profile_columns();

-- 3b. Resale listings: earnings and usage counters come from the server.
create or replace function public.protect_resale_counters()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.earnings_usd := 0;
      new.session_count := 0;
      if tg_table_name in ('iptv_shares', 'seedbox_shares') then
        new.view_count := 0;
      end if;
    else
      new.id := old.id;
      new.owner_account_id := old.owner_account_id;
      new.earnings_usd := old.earnings_usd;
      new.session_count := old.session_count;
      new.created_at := old.created_at;
      if tg_table_name in ('iptv_shares', 'seedbox_shares') then
        new.view_count := old.view_count;
      end if;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_resale_counters on public.iptv_shares;
create trigger trg_protect_resale_counters before insert or update on public.iptv_shares
  for each row execute function public.protect_resale_counters();
drop trigger if exists trg_protect_resale_counters on public.seedbox_shares;
create trigger trg_protect_resale_counters before insert or update on public.seedbox_shares
  for each row execute function public.protect_resale_counters();
drop trigger if exists trg_protect_resale_counters on public.vod_providers;
create trigger trg_protect_resale_counters before insert or update on public.vod_providers
  for each row execute function public.protect_resale_counters();

-- 3c. Comment vote counts are trigger-maintained.
create or replace function public.protect_comment_counters()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.upvotes := 0;
      new.downvotes := 0;
    else
      new.user_id := old.user_id;
      new.torrent_id := old.torrent_id;
      new.upvotes := old.upvotes;
      new.downvotes := old.downvotes;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_comment_counters on public.bt_torrent_comments;
create trigger trg_protect_comment_counters before insert or update on public.bt_torrent_comments
  for each row execute function public.protect_comment_counters();

-- The new trigger functions are never RPCs.
revoke execute on function public.protect_user_profile_columns() from public, anon, authenticated;
revoke execute on function public.protect_resale_counters() from public, anon, authenticated;
revoke execute on function public.protect_comment_counters() from public, anon, authenticated;

-- 4. get_user_family_plan failed for every caller ("structure of query does not
--    match function result type"): auth.users.email is varchar(255) on this
--    GoTrue, the function returns text. /api/family answered 500.
create or replace function public.get_user_family_plan(p_user_id uuid)
returns table(family_plan_id uuid, plan_name character varying, owner_id uuid, owner_email text,
              member_count integer, user_role character varying, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
begin
    return query
    select
        fp.id as family_plan_id,
        fp.plan_name,
        fp.owner_id,
        au.email::text as owner_email,
        public.get_family_member_count(fp.id) as member_count,
        fm.role as user_role,
        fp.created_at
    from public.family_plans fp
    join public.family_members fm on fm.family_plan_id = fp.id and fm.user_id = p_user_id
    join auth.users au on au.id = fp.owner_id;
end;
$function$;

notify pgrst, 'reload schema';
