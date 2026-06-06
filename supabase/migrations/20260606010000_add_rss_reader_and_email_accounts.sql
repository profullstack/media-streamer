-- RSS Reader and Email SMTP Accounts
-- Adds profile-scoped RSS subscriptions and user-scoped SMTP account config.

-- ============================================
-- RSS READER
-- ============================================

CREATE TABLE IF NOT EXISTS rss_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url TEXT UNIQUE NOT NULL,
  site_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  language TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_successful_fetch_at TIMESTAMPTZ,
  last_fetch_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rss_feeds_feed_url ON rss_feeds(feed_url);
CREATE INDEX IF NOT EXISTS idx_rss_feeds_last_fetched_at ON rss_feeds(last_fetched_at DESC);

CREATE TABLE IF NOT EXISTS rss_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  author TEXT,
  summary TEXT,
  content TEXT,
  image_url TEXT,
  enclosure_url TEXT,
  enclosure_type TEXT,
  published_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(feed_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_items_feed_id ON rss_feed_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_published_at ON rss_feed_items(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_rss_feed_items_created_at ON rss_feed_items(created_at DESC);

CREATE TABLE IF NOT EXISTS rss_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feed_id UUID NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
  custom_title TEXT,
  folder TEXT,
  notify_new_items BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, feed_id)
);

CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_profile_id ON rss_subscriptions(profile_id);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_feed_id ON rss_subscriptions(feed_id);
CREATE INDEX IF NOT EXISTS idx_rss_subscriptions_active ON rss_subscriptions(profile_id, is_active);

CREATE TABLE IF NOT EXISTS rss_item_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_saved BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_rss_item_states_profile_id ON rss_item_states(profile_id);
CREATE INDEX IF NOT EXISTS idx_rss_item_states_item_id ON rss_item_states(item_id);
CREATE INDEX IF NOT EXISTS idx_rss_item_states_unread ON rss_item_states(profile_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_rss_item_states_saved ON rss_item_states(profile_id, is_saved) WHERE is_saved = true;

CREATE OR REPLACE FUNCTION rss_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rss_feeds_updated_at ON rss_feeds;
CREATE TRIGGER trg_rss_feeds_updated_at
  BEFORE UPDATE ON rss_feeds
  FOR EACH ROW
  EXECUTE FUNCTION rss_set_updated_at();

DROP TRIGGER IF EXISTS trg_rss_subscriptions_updated_at ON rss_subscriptions;
CREATE TRIGGER trg_rss_subscriptions_updated_at
  BEFORE UPDATE ON rss_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION rss_set_updated_at();

DROP TRIGGER IF EXISTS trg_rss_item_states_updated_at ON rss_item_states;
CREATE TRIGGER trg_rss_item_states_updated_at
  BEFORE UPDATE ON rss_item_states
  FOR EACH ROW
  EXECUTE FUNCTION rss_set_updated_at();

ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_item_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rss feeds"
  ON rss_feeds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view rss feed items"
  ON rss_feed_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can view own rss subscriptions"
  ON rss_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_subscriptions.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own rss subscriptions"
  ON rss_subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_subscriptions.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own rss subscriptions"
  ON rss_subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_subscriptions.profile_id
      AND p.account_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_subscriptions.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own rss subscriptions"
  ON rss_subscriptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_subscriptions.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own rss item states"
  ON rss_item_states FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_item_states.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own rss item states"
  ON rss_item_states FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_item_states.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own rss item states"
  ON rss_item_states FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_item_states.profile_id
      AND p.account_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_item_states.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own rss item states"
  ON rss_item_states FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = rss_item_states.profile_id
      AND p.account_id = auth.uid()
    )
  );

-- ============================================
-- EMAIL SMTP ACCOUNTS
-- ============================================

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) >= 1 AND length(label) <= 100),
  provider TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to_email TEXT,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL CHECK (smtp_port > 0 AND smtp_port <= 65535),
  smtp_security TEXT NOT NULL DEFAULT 'starttls' CHECK (smtp_security IN ('none', 'starttls', 'tls')),
  smtp_username TEXT,
  smtp_password TEXT NOT NULL, -- TODO: encrypt at rest before production use.
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_checked_at TIMESTAMPTZ,
  last_check_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (last_check_status IN ('unchecked', 'success', 'failed')),
  last_check_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_last_check_status ON email_accounts(last_check_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_one_default_per_user
  ON email_accounts(user_id) WHERE is_default = true;

CREATE OR REPLACE FUNCTION email_accounts_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION email_accounts_ensure_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE email_accounts
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_accounts_updated_at ON email_accounts;
CREATE TRIGGER trg_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION email_accounts_set_updated_at();

DROP TRIGGER IF EXISTS trg_email_accounts_single_default ON email_accounts;
CREATE TRIGGER trg_email_accounts_single_default
  BEFORE INSERT OR UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION email_accounts_ensure_single_default();

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email accounts"
  ON email_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email accounts"
  ON email_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email accounts"
  ON email_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email accounts"
  ON email_accounts FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE email_accounts IS 'User-managed outbound SMTP account configurations.';
COMMENT ON COLUMN email_accounts.smtp_password IS 'SMTP password or app password. Must be encrypted at rest before production use.';
