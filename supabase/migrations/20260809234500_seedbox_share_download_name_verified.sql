-- Seedbox rentals: only a seedbox-verified torrent name may widen a pass's
-- streaming scope.
--
-- A download's `name` was seeded from the magnet's `dn=` parameter, which the
-- renter controls, and `name` is what authorizes playback (a pass may stream
-- files whose top-level path segment matches one of its download names). So a
-- renter could pay for a pass, submit a magnet carrying `dn=<a folder already
-- on the owner's box>`, and read the owner's existing library — content they
-- never downloaded.
--
-- `name_verified` separates the two roles the column was serving: the renter's
-- `dn` stays a display label, and only a name learned from the owner's torlink
-- `/status` (keyed by the infohash the torrent actually resolved to) grants
-- streaming scope.

ALTER TABLE seedbox_share_downloads
  ADD COLUMN IF NOT EXISTS name_verified BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN seedbox_share_downloads.name_verified IS
  'True only when `name` came from the owner''s seedbox (torlink /status), not from the renter-supplied magnet `dn`. Streaming scope is granted by verified names alone.';
