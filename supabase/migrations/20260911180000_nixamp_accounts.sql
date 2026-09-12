-- nixamp integration: the nixamp account a bittorrented user has connected.
--
-- nixamp.com is the OAuth 2.1 authorization server and we are the client, so
-- what is stored here is a grant rather than a credential: the nixamp user id
-- (the `sub`), the public handle to show other people, and the token pair.
--
-- One row per (user_id, nixamp_sub), matching bt_youtube_accounts. A person
-- may connect only one nixamp account in practice, but keying it this way
-- means re-connecting a DIFFERENT nixamp account adds a row rather than
-- silently overwriting the first one's tokens with the second one's.
--
-- The handle, not the email, is what any surface shows. On nixamp the account
-- address is the OAuth linking key and is treated as a credential; the handle
-- is the name that is safe in a room full of strangers.

CREATE TABLE IF NOT EXISTS bt_nixamp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nixamp_sub TEXT NOT NULL,                 -- stable nixamp account id
  nixamp_site TEXT NOT NULL DEFAULT 'https://nixamp.com',
  handle TEXT,                              -- the public name, e.g. chovy
  email TEXT,                               -- only when the email scope was granted
  access_token TEXT NOT NULL,               -- TODO: encrypt at rest
  -- Nullable because a grant without offline_access has none, and a row with
  -- an empty string for "no refresh token" is a row that will be presented as
  -- one -- which on nixamp withdraws the whole family.
  refresh_token TEXT,                       -- TODO: encrypt at rest
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nixamp_sub)
);

CREATE INDEX IF NOT EXISTS idx_bt_nixamp_accounts_user_id
  ON bt_nixamp_accounts(user_id);

CREATE OR REPLACE FUNCTION bt_nixamp_accounts_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_bt_nixamp_accounts_updated_at ON bt_nixamp_accounts;
CREATE TRIGGER trg_bt_nixamp_accounts_updated_at
  BEFORE UPDATE ON bt_nixamp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION bt_nixamp_accounts_set_updated_at();

-- RLS: a person sees only their own connection. The server uses the service
-- role and bypasses this, which is how the callback writes the row.
ALTER TABLE bt_nixamp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own nixamp account"
  ON bt_nixamp_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own nixamp account"
  ON bt_nixamp_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own nixamp account"
  ON bt_nixamp_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own nixamp account"
  ON bt_nixamp_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Which nixamp room a watch party has been bridged to.
--
-- The party itself still lives in the in-memory store next to the API route;
-- what is durable is the LINK, because a room on nixamp outlives this process
-- and re-bridging a party that already has a room would make a second room
-- nobody is in.
CREATE TABLE IF NOT EXISTS bt_watch_party_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_code TEXT NOT NULL UNIQUE,
  host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nixamp_site TEXT NOT NULL DEFAULT 'https://nixamp.com',
  nixamp_event_id TEXT NOT NULL,
  nixamp_room_id TEXT NOT NULL,
  nixamp_slug TEXT NOT NULL,
  nixamp_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bt_watch_party_rooms_host
  ON bt_watch_party_rooms(host_user_id);

DROP TRIGGER IF EXISTS trg_bt_watch_party_rooms_updated_at ON bt_watch_party_rooms;
CREATE TRIGGER trg_bt_watch_party_rooms_updated_at
  BEFORE UPDATE ON bt_watch_party_rooms
  FOR EACH ROW
  EXECUTE FUNCTION bt_nixamp_accounts_set_updated_at();

-- A bridged room is public knowledge: the whole point is that anybody with
-- the party code can find the room and join it. Writing is the server's.
ALTER TABLE bt_watch_party_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see a bridged watch party room"
  ON bt_watch_party_rooms FOR SELECT
  USING (TRUE);
