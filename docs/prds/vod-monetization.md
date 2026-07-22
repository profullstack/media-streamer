# PRD — VOD Monetization (providers connect a media server, charge $1/week or $1/title)

Status: M1 + M2 SHIPPED (2026-07-22, migration applied to prod & merged). Payout (M3) WIRED 2026-07-22 via CoinPay per-payment forwarding + sidebar nav link added.
Owner: anthony@profullstack.com
Related: `docs/prds/seedbox-pay-per-watch.md` (reuses its monetization spine), `src/lib/xtream/`,
`src/lib/iptv/`, `src/lib/iptv-proxy/`, `src/lib/seedbox/stream.ts`, `src/lib/coinpayportal/`

## 1. Summary

Let a **VOD provider** with a large existing collection connect their media server and monetize
public access — **no torrenting**. Viewers either buy a **$1 one-time 7-day pass** (whole-catalog
streaming) or **$1 per title** (the provider decides whether that unlocks streaming of that title
or a downloadable file). Payment is crypto via CoinPayPortal. This reuses the seedbox rental's
pass/grant/checkout/webhook/streaming spine; the difference is the content is the *provider's
existing catalog* (browse & play), not renter-supplied torrents.

## 2. Decisions (from product)

1. **Sources — support all:** `xtream` (Xtream Codes API), `m3u` (M3U/M3U8 playlist URL),
   `http_library` (directory-listing HTTP media server, like the seedbox files server),
   `manifest` (provider-supplied JSON catalog).
2. **$1/week = one-time 7-day pass** (not auto-renewing). Reuses the session-pass model with a
   7-day window; buy again to continue.
3. **$1/title = provider chooses** per catalog: a purchase grants **stream-unlock** or a
   **file download**.
4. Payout to providers = CoinPay per-payment forwarding via `merchant_wallet_address` — ✅ WIRED
   (2026-07-22). Provider is paid directly on their payout chain; CoinPay keeps ~1%.
5. No separate platform fee in the direct-forwarding model (CoinPay's ~1% is the only cut).

## 3. Personas & flow

**Provider (authed account):** connects a source (creds/URL), sets pricing (weekly and/or
per-title, default $1), syncs the catalog, gets a public link `/vod/<slug>`, watches earnings.

**Viewer (anonymous):** opens `/vod/<slug>`, browses the catalog (search + pagination), clicks a
title. If they lack access → pay: **$1/week** (unlocks the whole catalog for 7 days) or **$1 for
this title** (stream or download per the provider's setting). After payment → play in-browser
(or download).

## 4. Data model (new migrations)

Conventions per `seedbox_rental_shares.sql` (RLS, service-role writes, `updated_at` trigger with
pinned `search_path`).

### `vod_providers`
`id`, `slug UNIQUE`, `owner_account_id → auth.users`, `title`, `description`,
`source_kind` (`xtream|m3u|http_library|manifest`), source connection (secrets AES-256-GCM via
`src/lib/seedbox/crypto.ts`): `source_url`, `source_username`, `source_password_encrypted`,
`source_auth` (`none|bearer|basic|header`), `source_token_encrypted`, `source_header_name`;
pricing: `weekly_price_usd` (NULL = weekly not offered), `per_title_price_usd` (NULL = per-title
not offered), `pass_window_minutes` (default 10080 = 7d), `default_access_mode` (`stream|download`);
`payout_wallet_address`, `payout_blockchain`; `status` (`active|paused|closed`);
`catalog_count`, `last_synced_at`, `earnings_usd`, `session_count`; timestamps. RLS owner-scoped.

### `vod_titles` (catalog cache — synced from the source so browse/search is fast)
`id`, `provider_id → vod_providers`, `external_id` (source id), `title`, `kind`
(`movie|series|live|other`), `poster_url`, `plot`, `rating`, `category`, `stream_ref` (source
pointer: xtream stream id / http path / m3u url / manifest url), `extension`,
`access_mode` (NULL = provider default), `price_usd` (NULL = provider default), timestamps.
`UNIQUE(provider_id, external_id)`, index on `(provider_id, title)`. Service-role only.

### `vod_grants` (paid access — also the payment ledger)
`id`, `provider_id`, `grant_kind` (`weekly|title`), `title_id` (NULL for weekly),
`access_mode` (`stream|download`), `coinpayportal_payment_id UNIQUE`, `viewer_key_hash`
(sha256 of the anon viewer-session key — ties all of one viewer's grants together),
`status` (`pending|paid|expired|refunded`), `amount_usd` + crypto detail, `paid_at`,
`expires_at` (weekly & title-stream: paid+window; title-download: NULL = permanent), `metadata`,
timestamps. Service-role only. Indexes on `provider_id`, `coinpayportal_payment_id`,
`(provider_id, viewer_key_hash)`.

**Anonymous viewer identity:** one httpOnly cookie `vod_viewer_<slug>` = a high-entropy viewer
key set at first checkout; every grant is tagged `viewer_key_hash = sha256(key)`. Access =
"any paid, unexpired grant for (provider, viewer_key_hash)". This supports a weekly pass **plus**
multiple per-title purchases under a single cookie (a per-grant cookie can't).

## 5. Access resolution

- **Stream title T:** allowed if the viewer holds a paid+unexpired **weekly** grant for the
  provider, OR a **title** grant for T (either mode — download implies stream). Owner of the
  provider streams free (auth check).
- **Download title T:** allowed only via a **title** grant for T with `access_mode = 'download'`.

## 6. Source adapters (`src/lib/vod/adapters/`)

`VodSourceAdapter { listCatalog(cfg) → CatalogItem[]; resolveStream(cfg, title) → { url, headers,
extHint } }`.
- **xtream:** `player_api.php` get_vod_categories + get_vod_streams (`getXtreamVodStreams`), stream
  URL via `buildVodStreamUrl`.
- **m3u:** fetch + `parseM3U`; entries → titles; `stream_ref` = channel url.
- **http_library:** `listSeedboxDir`/`walkPlayableFiles` (seedbox files config shape) enumerate
  media files; `resolveStream` → `buildSeedboxFileUrl` + files auth headers.
- **manifest:** fetch provider JSON `{ items: [{ id, title, poster, plot, kind, stream_url,
  extension }] }`.

All resolved stream URLs pass `validateStreamUrl(url, isProd)` (SSRF guard, blocks private IPs in
prod) before proxying.

## 7. Streaming (`src/lib/seedbox/stream.ts` → generalized)

Extract a URL-based core `streamRemoteMedia({ url, headers, extHint }, opts)` (Range proxy for
web-friendly, on-the-fly ffmpeg transcode for mkv/HEVC/FLAC/…). `streamSeedboxFile` becomes a thin
wrapper (resolve files→url+headers → delegate). The public VOD stream route resolves the title via
its adapter, authorizes the pass, then delegates to `streamRemoteMedia`. Owner token/creds stay
server-side.

## 8. API surface

**Owner (authed):** `POST/GET /api/vod/providers`, `GET/PATCH/DELETE /api/vod/providers/[id]`,
`POST /api/vod/providers/[id]/sync` (pull catalog), `GET /api/vod/providers/[id]/activity`.

**Public:** `GET /api/public/vod/[slug]` (metadata + pricing), `GET …/catalog?q=&page=` (browse),
`POST …/checkout` (body `{ kind: 'weekly' | 'title', titleId? }` → pending grant + CoinPay,
sets viewer cookie), `GET …/access` (what the viewer holds), `GET …/grant/[grantId]` (poll),
`GET …/stream?titleId=` (+HEAD, `probe=1`), `GET …/download?titleId=`.

**Webhook:** `POST /api/webhooks/coinpayportal/vod` (signature-verified, `metadata.type='vod'`).

## 9. UI

- **Owner:** `/vod/manage` — connect a source, set pricing, sync, list providers + earnings,
  pause/close, copy public link.
- **Public:** `/vod/[slug]` — catalog grid (poster/title, search, pagination) + a title view with
  a paywall (Pay $1/week or Pay $1 for this title) → play/download.

## 10. Reuse map

- Pass token/cookie crypto: `src/lib/seedbox/shares/pass.ts` primitives (import the generic
  `generateGrantToken`/`hashGrantToken`/`verifyGrantToken`).
- CoinPay: `getCoinPayPortalClient()` + mirror `createCheckout`/`handleShareWebhook`.
- Xtream: `src/lib/xtream/xtream.ts`. M3U: `src/lib/iptv/iptv.ts`. Proxy SSRF: `src/lib/iptv-proxy`.
- Streaming: `streamRemoteMedia` (generalized). Encryption: `src/lib/seedbox/crypto.ts`.
- Catalog browse UI pattern: `src/app/api/browse/route.ts`; player: `seedbox-player-modal.tsx`.

## 11. Milestones

- **M1 — provider + catalog (no payment):** migrations; source adapters; sync; owner APIs +
  `/vod/manage`; public catalog browse `/vod/[slug]` (metadata + titles), playback locked.
- **M2 — payment + access + streaming:** grants + checkout (weekly + title) + webhook; viewer
  cookie + access resolution; `streamRemoteMedia` generalization; pass-gated stream/download
  routes; `/vod/[slug]` paywall + player. End-to-end: browse → pay $1 → watch/download.
- **M3 — payouts + polish:** CoinPay forwarding to provider — ✅ DONE; TMDB poster enrichment during
  sync — ✅ DONE (2026-07-22, `src/lib/vod/enrich.ts`, best-effort/capped/no-op without `TMDB_API_KEY`).
  Incremental sync — ✅ DONE (2026-07-22): only new external_ids are enriched + written
  (existing rows/posters untouched), `?full=1` forces a full re-process.
  Remaining: IMDB poster
  enrichment, catalog incremental sync + size caps surfaced, abuse controls, expiry sweep.

## 12. Notes / risk

- **Licensing/legal:** providers assert they have rights to the catalog they connect; surface a
  consent + takedown path (like the seedbox rental). Platform can pause/close instantly.
- Large catalogs: cap sync (e.g. 5000 titles/sync in v1) and `log()` truncation — never silently
  drop.
- Xtream/M3U/manifest streams are remote URLs → always SSRF-checked and proxied (creds/tokens
  server-side); `http_library` reuses the seedbox files auth.
