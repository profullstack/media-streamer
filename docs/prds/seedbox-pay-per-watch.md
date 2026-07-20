# PRD — Seedbox Rental (pay $0.25 to download + watch on someone's seedbox)

Status: M1 + M2 implemented (2026-07-20). Migration APPLIED to prod (bittorrented.com, ussbjnpovrynxyztjeeb) 2026-07-20 as versions 20260720061546 + 20260720061700. M3 (payouts) pending.
Owner: anthony@profullstack.com
Related: `docs/prds/managed-seedbox-reseller.md`, `src/lib/seedbox/`, `src/lib/coinpayportal/`, `src/lib/payments/`

## 1. Summary

Let a seedbox owner **temporarily and publicly rent out their seedbox**. An anonymous
visitor **pays $0.25 USD via CoinPayPortal** to get a time-boxed **session pass**, then
**submits their own magnet/torrent**, the owner's seedbox downloads it via torlink, and the
visitor **streams the completed files** back through the platform — the owner's seedbox
token is never exposed. Sharing is temporary: the owner sets an expiry and can pause/close
anytime.

The paying visitor is *driving* the owner's seedbox (add torrent → download → play), not
browsing a library the owner curated. Access is scoped: a pass can only stream torrents it
added, capped in count/size, and expires.

This is a **micro-payment / pay-per-session** model, distinct from `user_subscriptions`
(recurring) and `iptv_subscriptions` (per-package). It reuses the same CoinPayPortal client,
webhook-signature verification, torlink transports, streaming pipeline, and Supabase
migration conventions.

## 2. Goals / Non-goals

**Goals**
- Owner can publish a temporary, priced ($0.25 default) public rental of their seedbox.
- Anonymous visitor pays $0.25 → gets a time-boxed session pass.
- Under a valid pass, the visitor can add a magnet (up to a per-pass cap) to the owner's box,
  watch download progress, and stream the completed files.
- Streaming reuses the existing proxy/transcode pipeline; owner's token stays server-side;
  a pass can only reach torrents it added.
- Owner sees earnings + activity per rental.

**Non-goals (v1)**
- No fiat (crypto only).
- No general marketplace/discovery — access is by direct link only.
- No long-term storage guarantees — content is transient; owner may purge after the window.
- No per-title pricing — one $0.25 pass covers a whole session window + its download cap.

## 3. Personas & core flow

**Owner (authenticated account with a configured seedbox — HTTP add + files server):**
1. `/seedboxes` → new **"Rent Out"** tab.
2. Enables a public rental: title/description, price (default $0.25), session-pass window
   (default 24h), per-pass download cap (default 2, aligned with `TORLINK_MAX_DOWNLOADS`),
   optional max size/GB, share expiry (e.g. 7 days), optional payout wallet.
3. Gets a public link `https://<app>/rent/<slug>`.
4. Watches earnings + live sessions; can pause / extend / close.

**Renter (anonymous):**
1. Opens `/rent/<slug>` → sees title, description, price, what's allowed (N downloads, window).
2. Clicks **"Pay $0.25 to start"** → CoinPay hosted checkout.
3. Pays → webhook confirms → redirected back with a signed session-pass cookie.
4. Pastes a magnet → owner's box downloads it (torlink) → progress shown.
5. On completion, streams the files in-browser. Returning within the window (valid cookie)
   resumes without paying.

## 4. Data model (new Supabase migrations)

Conventions: `YYYYMMDDHHMMSS_*.sql`, `CREATE TABLE IF NOT EXISTS`, indexes,
`ENABLE ROW LEVEL SECURITY`, RLS (owner SELECT own via `auth.uid()`; service-role full via
`auth.jwt() ->> 'role' = 'service_role'`), shared `update_updated_at_column()` trigger.

### `seedbox_shares` — a public, temporary rental of an owner's seedbox
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE | random, unguessable public URL id |
| `owner_account_id` | uuid → `auth.users(id)` ON DELETE CASCADE | |
| `title` / `description` | text | |
| `price_usd` | numeric(10,2) default 0.25 | |
| `pass_window_minutes` | int default 1440 | how long a paid pass lasts |
| `max_downloads_per_pass` | int default 2 | aligns with torlink `TORLINK_MAX_DOWNLOADS` |
| `max_download_size_gb` | numeric NULL | optional per-torrent cap |
| `status` | text | `active` \| `paused` \| `expired` \| `closed` |
| `expires_at` | timestamptz NULL | temporary-share window; NULL = manual close only |
| `payout_wallet_address` / `payout_blockchain` | text NULL | owner payout dest (M3) |
| `view_count` / `session_count` | int default 0 | denormalized |
| `earnings_usd` | numeric(12,2) default 0 | denormalized gross |
| `created_at` / `updated_at` | timestamptz | |

RLS: owner SELECT/UPDATE/DELETE where `auth.uid() = owner_account_id`; service-role full.
Public reads go through the service-role API layer only.

### `seedbox_share_grants` — a paid session pass (also the per-payment ledger row)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `share_id` | uuid → `seedbox_shares(id)` ON DELETE CASCADE | |
| `coinpayportal_payment_id` | text UNIQUE NULL | set at checkout |
| `grant_token_hash` | text | `sha256(token)`; raw token only in the viewer cookie |
| `status` | text | `pending` \| `paid` \| `expired` \| `refunded` |
| `amount_usd` | numeric(10,2) | |
| `amount_crypto` / `crypto_currency` / `blockchain` / `tx_hash` | text NULL | payment detail |
| `viewer_fingerprint` | text NULL | hashed IP+UA for abuse limits |
| `paid_at` | timestamptz NULL | |
| `expires_at` | timestamptz NULL | `paid_at + pass_window_minutes` |
| `webhook_event_type` / `webhook_received_at` | | |
| `metadata` | jsonb NULL | |
| `created_at` / `updated_at` | timestamptz | |
Indexes on `share_id`, `coinpayportal_payment_id`. RLS: **service-role only** (renters are
anonymous; access is via the signed cookie/token, not Supabase auth).

### `seedbox_share_downloads` — torrents added under a pass (the dynamic access scope)
This is what a pass may stream. A pass can only reach files whose torrent it added.
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `grant_id` | uuid → `seedbox_share_grants(id)` ON DELETE CASCADE | |
| `share_id` | uuid → `seedbox_shares(id)` ON DELETE CASCADE | |
| `infohash` | text | parsed from magnet; matches torlink `/status` |
| `name` | text NULL | torrent display name / top-level dir (from torlink status) |
| `magnet` | text | the submitted magnet (validated) |
| `status` | text | `added` \| `downloading` \| `complete` \| `error` (best-effort) |
| `created_at` / `updated_at` | timestamptz | |
Indexes on `grant_id`, `share_id`, `(grant_id, infohash)` unique. RLS: service-role only.

**Streaming scope:** a requested file `path` is allowed for a pass iff its top-level segment
matches the `name` of one of that grant's `seedbox_share_downloads` rows (torlink saves each
torrent under its name). `buildSeedboxFileUrl` still blocks traversal on top of this.

## 5. API surface

### Owner (authenticated — `getCurrentUser()`, must own an HTTP-add + `files` seedbox)
- `POST /api/seedbox/shares` — create/enable a rental (validates `loadAccountSeedboxConfig`).
- `GET /api/seedbox/shares` — list my rentals with stats.
- `GET /api/seedbox/shares/[id]` / `PATCH` / `DELETE` — pause, resume, extend, edit caps/price, close.
- `GET /api/seedbox/shares/[id]/activity` — grants + downloads + gross totals.

### Public (anonymous)
- `GET /api/public/shares/[slug]` — public metadata only: title, description, price, window,
  download cap, `active` flag. **No owner identity, tokens, base URLs.**
- `POST /api/public/shares/[slug]/checkout` — create pending grant + CoinPay payment
  (`amount: price_usd`, `blockchain` from a **low-fee allowlist**,
  `metadata: { type: 'seedbox_share', shareId, grantId }`,
  `webhookUrl: {APP_URL}/api/webhooks/coinpayportal/share`,
  `redirectUrl: {APP_URL}/rent/{slug}?grant={grantId}`). Returns `{ paymentUrl, grantId }`.
- `GET /api/public/shares/[slug]/grant/[grantId]` — poll status; when `paid`, set signed
  httpOnly cookie `share_pass_<shareId>` = `{ grantId, token }`.
- `POST /api/public/shares/[slug]/downloads` — **requires valid pass.** Body `{ magnet }`.
  Validates magnet, enforces `max_downloads_per_pass`, calls `sendTorrentToSeedbox(ownerConfig, …)`,
  records a `seedbox_share_downloads` row (infohash from magnet).
- `GET /api/public/shares/[slug]/downloads` — **requires valid pass.** Lists this grant's
  downloads with live progress (proxy owner torlink `/status`, filtered to the grant's infohashes).
- `GET /api/public/shares/[slug]/stream?path=<path>` (+ `HEAD`) — **requires valid pass**;
  enforcement order:
  1. Resolve share by slug → active & not expired, else 404/410.
  2. Validate pass: signed cookie → grant → `paid`, not expired, `share_id` matches; else 402.
  3. Validate `path`'s top-level segment ∈ this grant's download `name`s; else 403.
  4. Load owner config (service role) and delegate to the shared stream helper (§6). Supports
     `Range` and `probe=1`, identical behavior to the personal route.

### Webhook
- `POST /api/webhooks/coinpayportal/share` — copy the **signature-verifying** pattern from
  `src/app/api/webhooks/coinpayportal/route.ts`. On `payment.confirmed`: mark grant `paid`,
  set `paid_at`/`expires_at`, `session_count++`, `earnings_usd += amount`. On `payment.forwarded`:
  record payout (M3). On `failed`/`expired`: mark grant `expired`. Idempotent on
  `coinpayportal_payment_id`. Route by `metadata.type = 'seedbox_share'`.

## 6. Refactor: shared streaming core

Extract the body of `proxy()` in `src/app/api/seedbox/stream/route.ts` (probe, audio/video
transcode decision, Range proxy, Content-Type forcing) into:

```ts
// src/lib/seedbox/stream.ts
export async function streamSeedboxFile(
  files: SeedboxFilesConfig,
  filePath: string,
  opts: { method: 'GET' | 'HEAD'; range?: string | null; probe?: boolean }
): Promise<Response>
```

Both the authed personal route and the public rental route become thin wrappers: resolve
`files` (session vs. share owner) + authorize, then delegate. No behavior change to the
personal route — guard with existing tests + a new share-route test.

## 7. Payouts (owner gets paid) — DECIDED: CoinPay forwarding to owner wallet

Owner supplies `payout_wallet_address`; funds forward (minus platform fee) to it; platform
never custodies; `payment.forwarded` webhook records payout.

**Gap found in code:** the current `CoinPayPortalClient.createPayment` has **no per-payment
destination/forwarding param** — CoinPay forwards to the merchant-level wallet. So true
per-owner forwarding needs a CoinPayPortal API capability the client doesn't expose yet.
**Therefore payout is M3.** In M1/M2 we capture `payout_wallet_address` and payments collect
to the platform merchant; owner earnings are tracked in `earnings_usd`. Verify the CoinPay
forwarding API, then wire M3.

Platform fee: default 20% (`SEEDBOX_SHARE_PLATFORM_FEE_PCT`).
Micro-payment fee caveat: on-chain fees on $0.25 can rival the amount — restrict checkout to
**low-fee chains** (SOL / USDC_SOL / POL / USDC_POL from `getSupportedCoins()`).

## 8. UI

**Owner** — new `rent` tab in `src/app/seedboxes/seedbox-tabs.tsx` ("Rent Out", alongside
Setup / Torlink status): rentals list (status, earnings, copy-link), enable/edit form (price,
window, caps, expiry, payout wallet), pause/extend/close, live sessions/activity.

**Public** — new unauthenticated route `src/app/rent/[slug]/page.tsx`: title, description,
price, allowance → **"Pay $0.25 to start"** → CoinPay → back → unlock. Then a magnet input +
download list with progress + in-browser player (reuse `SeedboxPlayerModal`/playlist player
pointed at `/api/public/shares/[slug]/stream`, `probe=1` supported). Valid-pass cookie skips
payment.

## 9. Abuse / security / legal notes

- **Legal exposure:** the owner's box downloads whatever a paying stranger points it at.
  Surface a clear consent + terms on enabling a rental, and a takedown/report path. Owner
  controls: pause/close instantly, per-pass download + size caps, session expiry, and content
  purge after the window.
- **Payer-scoped streaming** (§4/§5) is the hard boundary preventing a renter from browsing
  the owner's library or other renters' downloads — a pass streams only torrents it added.
- **Add-torrent caps:** enforce `max_downloads_per_pass` server-side per grant; reuse torlink's
  `TORLINK_MAX_DOWNLOADS` as the box-level backstop.
- **Magnet validation:** reuse `isValidMagnet`; reject non-magnet/oversized inputs.
- Session pass is a bearer cookie → shareable; mitigate with short window, optional IP/UA
  binding (`viewer_fingerprint`), concurrent-stream cap. $0.25 stakes are low; document it.
- Public metadata endpoint never returns owner identity, tokens, base URLs, or full listings.
- Slugs random/unguessable; rentals are link-only (no enumeration).
- Auto-close sweep flips `active → expired` past `expires_at`; expires stale grants.

## 10. Decisions

1. **Model — DECIDED:** pay $0.25 → time-boxed session pass → add own magnet → owner's box
   downloads → stream. Payer-scoped (stream only what you added), capped, expiring.
2. **Payout — DECIDED:** CoinPay forwarding to owner wallet (implementation deferred to M3 —
   client API gap, §7).
3. **Viewer identity — anonymous** (signed cookie pass, no login).
4. **Platform fee %** — default 20%.
5. **Owners never pay.** An owner opening their own `/rent/<slug>` link is auto-granted a
   free session pass (`POST /owner-pass` mints a $0 `paid` grant scoped to the owner) instead
   of the paywall. Owners otherwise use their box free via the normal authed Seedboxes UI.

## 11. Milestones

- **M1 — Owner rental management (no payment):** migrations (shares/grants/downloads), owner
  CRUD APIs, "Rent Out" tab. Rentals can be created/managed; public page shows metadata but
  the pass/download/stream flow is locked.
- **M2 — Payment + rent flow:** checkout route, share webhook (signature-verified), grant
  issuance + signed cookie, add-magnet + downloads-progress routes, stream-core refactor (§6),
  public payer-scoped stream route, `/rent/[slug]` page (pay → add magnet → progress → play).
  End-to-end: pay $0.25 → download → watch.
- **M3 — Payouts + polish:** owner payout via CoinPay forwarding, platform fee, earnings
  dashboard, abuse/IP binding, concurrent-stream cap, expiry sweep, low-fee-chain restriction.
