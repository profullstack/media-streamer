-- Add explicit IMAP configuration columns to email_accounts.
-- All columns are nullable; when null the app auto-derives settings from the
-- provider preset (e.g. Gmail SMTP → imap.gmail.com:993). Storing them
-- explicitly lets accounts like Forward Email use a separate IMAP password.
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS imap_host     TEXT,
  ADD COLUMN IF NOT EXISTS imap_port     INTEGER CHECK (imap_port IS NULL OR (imap_port > 0 AND imap_port <= 65535)),
  ADD COLUMN IF NOT EXISTS imap_security TEXT    CHECK (imap_security IS NULL OR imap_security IN ('none', 'starttls', 'tls')),
  ADD COLUMN IF NOT EXISTS imap_username TEXT,   -- encrypted, nullable
  ADD COLUMN IF NOT EXISTS imap_password TEXT;   -- encrypted, nullable — falls back to smtp_password when null
