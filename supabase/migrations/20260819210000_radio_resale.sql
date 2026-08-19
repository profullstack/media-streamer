-- Resale of a SiriusXM line, alongside the IPTV one.
--
-- The grant, session and payment machinery is identical for both rails -- a paid
-- pass, a concurrency cap, an opaque session id -- so this adds a `kind` to the
-- existing tables rather than duplicating three of them.
--
-- The table names still say iptv_ because renaming them would mean rewriting every
-- query and re-running a migration already applied in production, for no behaviour
-- change. Worth doing if a third rail ever appears; not worth it for the second.
alter table iptv_shares
  add column if not exists kind text not null default 'iptv';

alter table iptv_shares
  drop constraint if exists iptv_shares_kind_check;
alter table iptv_shares
  add constraint iptv_shares_kind_check check (kind in ('iptv', 'radio'));

-- A radio share has no playlist of its own: the channels come from the owner's
-- SiriusXM credentials, which already live in their account.
alter table iptv_shares alter column playlist_id drop not null;

-- Which must hold: an IPTV share is meaningless without one.
alter table iptv_shares
  drop constraint if exists iptv_shares_playlist_required;
alter table iptv_shares
  add constraint iptv_shares_playlist_required
  check (kind <> 'iptv' or playlist_id is not null);

create index if not exists iptv_shares_kind_idx on iptv_shares (kind) where status = 'active';

comment on column iptv_shares.kind is
  'iptv = resell an M3U playlist; radio = restream the owner''s SiriusXM line.';
comment on table iptv_shares is
  'Public, priced resale of an owner''s IPTV playlist or SiriusXM line.';
