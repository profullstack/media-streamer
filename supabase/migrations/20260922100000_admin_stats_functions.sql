-- Admin console: platform stats and a paginated user directory.
--
-- Both functions read auth.users, so they are SECURITY DEFINER and executable
-- by service_role only. The Next.js admin routes call them through the
-- service client after requireAdminUser(); nothing here is reachable from a
-- browser session.

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
    (select count(*) from public.torrents)                                                        as torrents,
    (select exact_count from public.bt_torrent_count_cache where id = 'dht')                      as dht_torrents,
    (select counted_at from public.bt_torrent_count_cache where id = 'dht')                       as dht_counted_at,
    (select count(*) from public.bt_torrent_comments)                                                as comments,
    (select count(*) from public.bt_torrent_favorites)                                               as favorites,
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


create or replace function public.admin_list_users(
  p_search text default null,
  p_sort   text default 'created_at',
  p_dir    text default 'desc',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_sort   text := case when p_sort in ('created_at','last_sign_in_at','email','paid_usd','tier') then p_sort else 'created_at' end;
  v_desc   boolean := coalesce(lower(p_dir), 'desc') <> 'asc';
  v_total  bigint;
  v_rows   jsonb;
begin
  with base as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null                                       as confirmed,
      (u.banned_until is not null and u.banned_until > now())                as banned,
      up.username,
      coalesce(up.is_admin, false) or au.user_id is not null                  as is_admin,
      coalesce(s.tier, 'trial')                                               as tier,
      coalesce(s.status, 'active')                                            as status,
      case when coalesce(s.tier, 'trial') = 'trial' then s.trial_expires_at else s.subscription_expires_at end as expires_at,
      coalesce(p.paid_usd, 0)                                                 as paid_usd,
      coalesce(p.paid_count, 0)                                               as paid_count
    from auth.users u
    left join public.user_profiles up on up.user_id = u.id
    left join public.admin_users au on au.user_id = u.id
    left join public.user_subscriptions s on s.user_id = u.id
    left join (
      select user_id,
             sum(amount_usd) filter (where status in ('confirmed','forwarding','forwarded','completed','paid')) as paid_usd,
             count(*)        filter (where status in ('confirmed','forwarding','forwarded','completed','paid')) as paid_count
      from public.payment_history
      group by user_id
    ) p on p.user_id = u.id
    where u.deleted_at is null
      and (v_search is null
           or u.email ilike '%' || v_search || '%'
           or up.username ilike '%' || v_search || '%'
           or u.id::text = v_search)
  ),
  counted as (select count(*) as n from base),
  page as (
    select * from base
    order by
      case when v_sort = 'created_at'      and v_desc     then created_at end desc nulls last,
      case when v_sort = 'created_at'      and not v_desc then created_at end asc  nulls last,
      case when v_sort = 'last_sign_in_at' and v_desc     then last_sign_in_at end desc nulls last,
      case when v_sort = 'last_sign_in_at' and not v_desc then last_sign_in_at end asc  nulls last,
      case when v_sort = 'email'           and v_desc     then email end desc,
      case when v_sort = 'email'           and not v_desc then email end asc,
      case when v_sort = 'paid_usd'        and v_desc     then paid_usd end desc,
      case when v_sort = 'paid_usd'        and not v_desc then paid_usd end asc,
      case when v_sort = 'tier'            and v_desc     then tier end desc,
      case when v_sort = 'tier'            and not v_desc then tier end asc,
      created_at desc
    limit v_limit offset v_offset
  )
  select (select n from counted),
         coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'sort', v_sort,
    'dir', case when v_desc then 'desc' else 'asc' end,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_list_users(text, text, text, int, int) from public;
grant execute on function public.admin_list_users(text, text, text, int, int) to service_role;
