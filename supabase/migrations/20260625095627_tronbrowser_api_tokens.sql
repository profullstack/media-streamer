-- TronBrowser "Connect" integration: long-lived API tokens minted via the
-- hosted /connect consent flow. TronBrowser (and future standalone extensions)
-- present these as `Authorization: Bearer btr_...` to the token-auth /api/v1/*
-- endpoints (favorites, live TV, radio, podcasts). Only the SHA-256 hash of the
-- token is stored — the plaintext is shown to the client once at mint time.

create table if not exists public.api_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  token_hash  text not null unique,
  name        text not null default 'TronBrowser',
  scopes      text[] not null default array['media:read']::text[],
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

create index if not exists api_tokens_user_id_idx on public.api_tokens (user_id);
create index if not exists api_tokens_token_hash_idx on public.api_tokens (token_hash);

-- RLS: the service-role server client (used for token verification) bypasses
-- RLS; these policies just let a signed-in user list/revoke their OWN tokens
-- from a future management UI.
alter table public.api_tokens enable row level security;

drop policy if exists api_tokens_select_own on public.api_tokens;
create policy api_tokens_select_own on public.api_tokens
  for select using (auth.uid() = user_id);

drop policy if exists api_tokens_delete_own on public.api_tokens;
create policy api_tokens_delete_own on public.api_tokens
  for delete using (auth.uid() = user_id);
