-- How many user secrets are still under the legacy server key (or plaintext)?
-- Run before flipping LEGACY_KEY_MIGRATION=off. Prints counts only, never values.
--   docker exec -i bittorrented-com-supabase-db psql -U postgres -d postgres < scripts/vault-legacy-report.sql
SELECT 'account_seedbox_configs' AS tbl,
       count(*) FILTER (WHERE http_token_encrypted NOT LIKE 'ss2:%'
                           OR ssh_private_key_encrypted NOT LIKE 'ss2:%'
                           OR files_token_encrypted NOT LIKE 'ss2:%'
                           OR files_basic_pass_encrypted NOT LIKE 'ss2:%') AS legacy_rows,
       count(DISTINCT account_id) FILTER (WHERE http_token_encrypted NOT LIKE 'ss2:%'
                           OR ssh_private_key_encrypted NOT LIKE 'ss2:%'
                           OR files_token_encrypted NOT LIKE 'ss2:%'
                           OR files_basic_pass_encrypted NOT LIKE 'ss2:%') AS users
  FROM public.account_seedbox_configs
UNION ALL
SELECT 'email_accounts',
       count(*) FILTER (WHERE smtp_password NOT LIKE 'ss2:%' OR imap_password NOT LIKE 'ss2:%'),
       count(DISTINCT user_id) FILTER (WHERE smtp_password NOT LIKE 'ss2:%' OR imap_password NOT LIKE 'ss2:%')
  FROM public.email_accounts
UNION ALL
SELECT 'finance_broker_connections',
       count(*) FILTER (WHERE c.encrypted_credentials NOT LIKE 'ss2:%'),
       count(DISTINCT p.account_id) FILTER (WHERE c.encrypted_credentials NOT LIKE 'ss2:%')
  FROM public.finance_broker_connections c JOIN public.profiles p ON p.id = c.profile_id
UNION ALL
SELECT 'bt_spotify_sessions',
       count(*) FILTER (WHERE credentials_enc NOT LIKE 'ss2:%'),
       count(DISTINCT user_id) FILTER (WHERE credentials_enc NOT LIKE 'ss2:%')
  FROM public.bt_spotify_sessions
UNION ALL
SELECT 'vod_providers',
       count(*) FILTER (WHERE source_password_encrypted NOT LIKE 'ss2:%' OR source_token_encrypted NOT LIKE 'ss2:%'),
       count(DISTINCT owner_account_id) FILTER (WHERE source_password_encrypted NOT LIKE 'ss2:%' OR source_token_encrypted NOT LIKE 'ss2:%')
  FROM public.vod_providers
UNION ALL
SELECT 'bt_youtube_accounts',
       count(*) FILTER (WHERE access_token NOT LIKE 'ss2:%' OR refresh_token NOT LIKE 'ss2:%'),
       count(DISTINCT user_id) FILTER (WHERE access_token NOT LIKE 'ss2:%' OR refresh_token NOT LIKE 'ss2:%')
  FROM public.bt_youtube_accounts
UNION ALL
SELECT 'bt_nixamp_accounts',
       count(*) FILTER (WHERE (access_token <> '' AND access_token NOT LIKE 'ss2:%') OR refresh_token NOT LIKE 'ss2:%'),
       count(DISTINCT user_id) FILTER (WHERE (access_token <> '' AND access_token NOT LIKE 'ss2:%') OR refresh_token NOT LIKE 'ss2:%')
  FROM public.bt_nixamp_accounts
UNION ALL
SELECT 'bt_siriusxm_sessions',
       count(*) FILTER (WHERE access_token NOT LIKE 'ss2:%' OR (session_cookies <> '' AND session_cookies NOT LIKE 'ss2:%')),
       count(DISTINCT user_id) FILTER (WHERE access_token NOT LIKE 'ss2:%' OR (session_cookies <> '' AND session_cookies NOT LIKE 'ss2:%'))
  FROM public.bt_siriusxm_sessions;
