-- Let a rental name which seedbox it rents out.
--
-- An account can now connect several seedboxes, and it can already create several
-- rental listings -- but every listing resolved the owner's *default* box. So two
-- listings for two different machines both served the same one, and the second
-- machine could not be rented out at all.
--
-- Null means "whatever the account's default is", which is exactly how every
-- existing listing already behaves, so nothing in flight changes.
alter table seedbox_shares
  add column if not exists seedbox_id uuid
    references account_seedbox_configs(id) on delete set null;

create index if not exists seedbox_shares_seedbox_idx
  on seedbox_shares (seedbox_id) where seedbox_id is not null;

comment on column seedbox_shares.seedbox_id is
  'Which of the owner''s seedboxes this rents out. Null = the account default.';
