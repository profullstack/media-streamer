-- public.torrents is the 19M-row DHT crawl; counting it in a request is what
-- bt_torrent_count_cache exists to avoid. Count user uploads (bt_torrents)
-- exactly and take the DHT total from the cache.

create or replace function public.admin_platform_stats()
returns jsonb
language sql
security definer
set search_path = public, auth
stable
as $$
with
users as (
  select
    count(*) filter (where deleted_at is null)                                   as total,
    count(*) filter (where deleted_at is null and email_confirmed_at is not null) as confirmed,
    count(*) filter (where created_at >= now() - interval '24 hours')            as new_24h,
    count(*) filter (where created_at >= now() - interval '7 days')              as new_7d,
    count(*) filter (where created_at >= now() - interval '30 days')             as new_30d,
    count(*) filter (where last_sign_in_at >= now() - interval '24 hours')       as active_24h,
    count(*) filter (where last_sign_in_at >= now() - interval '7 days')         as active_7d,
    count(*) filter (where last_sign_in_at >= now() - interval '30 days')        as active_30d,
    count(*) filter (where banned_until is not null and banned_until > now())    as banned
  from auth.users
),
signups as (
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(s.n, 0)) order by d.day), '[]'::jsonb) as series
  from generate_series((current_date - interval '29 days')::date, current_date, interval '1 day') as d(day)
  left join (
    select created_at::date as day, count(*) as n
    from auth.users
    where created_at >= current_date - interval '29 days'
    group by 1
  ) s on s.day = d.day
),
subs as (
  select
    count(*) filter (where tier = 'trial' and status = 'active' and (trial_expires_at is null or trial_expires_at > now()))  as trial_active,
    count(*) filter (where tier = 'trial' and (status <> 'active' or trial_expires_at <= now()))                              as trial_expired,
    count(*) filter (where tier = 'premium' and status = 'active' and (subscription_expires_at is null or subscription_expires_at > now())) as premium_active,
    count(*) filter (where tier = 'family' and status = 'active' and (subscription_expires_at is null or subscription_expires_at > now()))  as family_active,
    count(*) filter (where tier in ('premium','family') and (status <> 'active' or subscription_expires_at <= now()))         as paid_lapsed,
    count(*) filter (where status = 'cancelled')                                                                              as cancelled,
    count(*) filter (where tier in ('premium','family') and status = 'active' and subscription_expires_at between now() and now() + interval '7 days') as expiring_7d
  from public.user_subscriptions
),
pay as (
  select
    count(*) filter (where status in ('confirmed','forwarding','forwarded','completed','paid'))                                                    as paid_count,
    coalesce(sum(amount_usd) filter (where status in ('confirmed','forwarding','forwarded','completed','paid')), 0)                                as paid_usd,
    count(*) filter (where status in ('confirmed','forwarding','forwarded','completed','paid') and created_at >= now() - interval '30 days')       as paid_count_30d,
    coalesce(sum(amount_usd) filter (where status in ('confirmed','forwarding','forwarded','completed','paid') and created_at >= now() - interval '30 days'), 0) as paid_usd_30d,
    count(*) filter (where status in ('pending','detected'))                                                                                        as pending_count
  from public.payment_history
),
iptv_pay as (
  select
    count(*) filter (where status in ('confirmed','forwarding','forwarded','completed','paid'))                             as paid_count,
    coalesce(sum(amount_usd) filter (where status in ('confirmed','forwarding','forwarded','completed','paid')), 0)         as paid_usd
  from public.iptv_payment_history
),
content as (
  select
    (select count(*) from public.bt_torrents)                                                     as user_torrents,
    (select exact_count from public.bt_torrent_count_cache where id = 'dht')                      as dht_torrents,
    (select counted_at from public.bt_torrent_count_cache where id = 'dht')                       as dht_counted_at,
    (select count(*) from public.bt_torrent_comments)                                             as comments,
    (select count(*) from public.bt_torrent_favorites)                                            as favorites,
    (select count(*) from public.collections)                                                     as collections,
    (select count(*) from public.user_watchlists)                                                 as watchlists,
    (select count(*) from public.podcast_subscriptions)                                           as podcast_subscriptions,
    (select count(*) from public.iptv_subscriptions where status = 'active' and (expires_at is null or expires_at > now())) as iptv_active,
    (select count(*) from public.seedbox_shares)                                                  as seedbox_shares,
    (select count(*) from public.family_plans)                                                    as family_plans,
    (select count(*) from public.referral_usages)                                                 as referral_usages,
    (select count(*) from public.profiles)                                                        as viewing_profiles
)
select jsonb_build_object(
  'generated_at', now(),
  'users', (select to_jsonb(users) from users),
  'signups_daily', (select series from signups),
  'subscriptions', (select to_jsonb(subs) from subs),
  'revenue', jsonb_build_object(
    'subscriptions', (select to_jsonb(pay) from pay),
    'iptv', (select to_jsonb(iptv_pay) from iptv_pay)
  ),
  'content', (select to_jsonb(content) from content)
);
$$;

revoke all on function public.admin_platform_stats() from public;
grant execute on function public.admin_platform_stats() to service_role;
