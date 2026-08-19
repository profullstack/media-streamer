-- Let an account connect more than one seedbox.
--
-- The table was keyed by account_id, so "one seedbox per account" was not a policy
-- anyone chose -- it was the primary key. This gives each row its own id and keeps
-- account_id as an ordinary indexed column.
--
-- Every existing row becomes that account's default, so nothing an account has
-- already connected changes behaviour: the code paths that ask for "the seedbox"
-- keep resolving to exactly the row they resolved to before.

alter table account_seedbox_configs
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists name text,
  add column if not exists is_default boolean not null default false;

-- Each account has at most one row at this point, so this cannot pick a winner
-- arbitrarily -- there is only ever one candidate.
update account_seedbox_configs set is_default = true where is_default is not true;
update account_seedbox_configs set name = 'My seedbox' where name is null;

alter table account_seedbox_configs drop constraint if exists account_seedbox_configs_pkey;
alter table account_seedbox_configs add primary key (id);

create index if not exists account_seedbox_configs_account_idx
  on account_seedbox_configs (account_id);

-- Exactly one default per account. A partial unique index is what stops two rows
-- both claiming it, which would make "the account's seedbox" ambiguous again.
create unique index if not exists account_seedbox_configs_one_default
  on account_seedbox_configs (account_id) where is_default;

comment on column account_seedbox_configs.name is
  'What the owner calls this box. Shown in the picker; never sent to the box itself.';
comment on column account_seedbox_configs.is_default is
  'The one used when a request does not name a seedbox. Exactly one per account.';
