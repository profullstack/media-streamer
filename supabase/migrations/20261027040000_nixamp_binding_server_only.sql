-- Sign in with nixamp now finds the account here by the nixamp `sub` bound in
-- bt_nixamp_accounts (never by email). So the binding is an identity claim and
-- only the server may write it: the OAuth callback, with the service role,
-- after nixamp has proved the sub. A signed-in user could otherwise INSERT a
-- row binding somebody else's nixamp sub to their own account through
-- PostgREST. Reading and deleting your own connection stay allowed.
DROP POLICY IF EXISTS "Users can insert own nixamp account" ON bt_nixamp_accounts;
DROP POLICY IF EXISTS "Users can update own nixamp account" ON bt_nixamp_accounts;
REVOKE INSERT, UPDATE ON bt_nixamp_accounts FROM anon, authenticated;
