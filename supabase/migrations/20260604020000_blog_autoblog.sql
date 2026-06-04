-- Blog posts table for autoblog-ingested articles.
-- Mirrors the crawlproof.com pattern: source+source_id dedup,
-- public SELECT, service-role write.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'crawlproof',
  source_id text,
  slug text not null,
  title text not null,
  content_markdown text,
  content_html text,
  meta_description text,
  image_url text,
  tags text[] not null default '{}',
  source_created_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create unique index if not exists blog_posts_slug_idx on public.blog_posts (slug);
create index if not exists blog_posts_published_at_idx on public.blog_posts (published_at desc);
create index if not exists blog_posts_tags_idx on public.blog_posts using gin (tags);

alter table public.blog_posts enable row level security;

create policy "blog_posts public read"
  on public.blog_posts for select using (true);

create policy "blog_posts service role write"
  on public.blog_posts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Autoblog webhook integrations: one row per bearer token.
create table if not exists public.autoblog_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'crawlproof'
    check (kind in ('outrank', 'crawlproof')),
  access_token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  request_count integer not null default 0,
  allowed_niches text[] not null default '{}',
  min_word_count integer default 500,
  max_link_density numeric(5,2) default 1.0,
  banned_terms text[] not null default '{}',
  min_quality_score smallint
);

create index if not exists autoblog_integrations_token_idx on public.autoblog_integrations (access_token);

alter table public.autoblog_integrations enable row level security;

create policy "autoblog_integrations service role all"
  on public.autoblog_integrations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Atomic counter bump called by the webhook receiver.
create or replace function public.bump_autoblog_integration(integration_id uuid)
returns void language sql security definer as $$
  update public.autoblog_integrations
     set last_used_at = now(),
         request_count = request_count + 1
   where id = integration_id;
$$;
revoke all on function public.bump_autoblog_integration(uuid) from public;
grant execute on function public.bump_autoblog_integration(uuid) to service_role;

-- Simple admin flag: one row per admin user.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "admin_users service role all"
  on public.admin_users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
