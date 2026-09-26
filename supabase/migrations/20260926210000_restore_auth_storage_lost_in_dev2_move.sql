-- Restore the triggers on auth.users that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a trigger
-- under its table's schema, so every trigger ON auth.users was dropped while
-- the public functions they call survived. From the cutover on, a signup got
-- neither its 3-day trial row in user_subscriptions nor its default
-- "Profile 1" row in profiles.
--
-- The migrations define no policies on storage.objects or storage.buckets,
-- so there is nothing to restore there.
--
-- Idempotent: safe to re-run.

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_trial_subscription();

DROP TRIGGER IF EXISTS trigger_create_default_profile ON auth.users;
CREATE TRIGGER trigger_create_default_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_profile_on_signup();

-- Backfill what create_trial_subscription would have written for the users
-- created while the trigger was missing. The trial dates are the ones the
-- trigger would have set at signup (created_at, created_at + 3 days), not a
-- fresh trial from today. Scoped to the cutover day so older accounts without
-- a row (pre-subscription signups) are left as they were.
INSERT INTO public.user_subscriptions (
    user_id,
    tier,
    status,
    trial_started_at,
    trial_expires_at
)
SELECT
    u.id,
    'trial',
    'active',
    u.created_at,
    u.created_at + INTERVAL '3 days'
FROM auth.users u
WHERE u.created_at >= '2026-09-25'
  AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Backfill what create_default_profile_on_signup would have written. Every
-- account is meant to have a profile (20260220010000 backfilled all users the
-- same way), so this is not scoped by date. Inserting a profile fires
-- trigger_subscribe_default_feeds on profiles, which subscribes it to the
-- house RSS feeds, exactly as a normal signup would; nothing is emailed.
INSERT INTO public.profiles (account_id, name, is_default)
SELECT u.id, 'Profile 1', true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.account_id = u.id)
ON CONFLICT DO NOTHING;
