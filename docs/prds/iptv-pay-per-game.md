# IPTV Resale (pay-per-game)

Resell access to an IPTV line you already pay for, by the game rather than by the
month. Mirrors [seedbox pay-per-watch](./seedbox-pay-per-watch.md); read that first
for the payment and pass mechanics, which are deliberately identical.

## Flow

1. An owner lists one of their `iptv_playlists` for resale: a price (default $1), a
   pass window (default 240 minutes), a concurrency cap, and optionally a subset of
   channels.
2. A visitor opens `/watch/<slug>`, pays through CoinPayPortal, and gets an httpOnly
   pass cookie. The cookie is set at checkout but grants nothing until the webhook
   confirms the payment.
3. They pick a channel, which opens a *session*. The session is what the concurrency
   cap counts.
4. They watch through `/api/public/iptv/<slug>/stream?session=<id>`.

## The two things that make this different from seedbox rental

### The buyer must never see the upstream URL

An IPTV M3U URL usually embeds the owner's provider username and password. The
platform's general `/api/iptv-proxy` takes the stream URL as a query parameter and
"encodes" it with `encodeURIComponent` — fine when you are streaming your own
playlist to yourself, useless here, because the buyer would read the credentials out
of the query string, keep them, and never pay again.

So a resale stream is addressed by an opaque session id and the upstream is resolved
server-side on every request. HLS manifests are rewritten before they reach the
client with each URL **encrypted** (AES-256-GCM, the platform `ENCRYPTION_KEY`)
rather than encoded — including `URI="..."` attributes, because leaving the
`EXT-X-KEY` URI alone publishes the decryption-key endpoint on the owner's line even
when every segment is sealed. Decrypting a segment still requires a valid pass and a
live session, so a leaked ciphertext on its own is inert.

### Concurrency is enforced continuously, not counted at checkout

A provider subscription allows N simultaneous connections. Exceeding it does not
merely degrade playback — it is what gets the owner's account terminated. So:

- `iptv_share_sessions` holds live sessions; the player heartbeats.
- A session unheard-from for 90 seconds is reaped, because a viewer who closes the
  tab never sends a stop and would otherwise hold their slot until the pass expired.
- Reaping runs immediately before every capacity check rather than on a timer: a cron
  that has not fired yet leaves the line looking full, and the check is the only
  place the answer matters.
- Checkout refuses when the line is fully booked, rather than taking the money and
  failing at kickoff. `capacityAvailable` is on the public listing for the same reason.
- Re-opening the same channel on the same pass reuses the slot instead of consuming
  a second one.

`max_active_passes` is separate from `max_concurrent_streams`: people buy passes they
do not all redeem simultaneously, so it is normally higher.

## Guardrails

- A pass window cannot exceed 24 hours. Selling a month is not pay-per-game, it is
  subletting the account — which is the thing providers actually ban people for.
- An owner can only list a playlist they own (`playlistBelongsTo`), or they could
  collect money while a stranger's line absorbed the load.
- Channel ids outside `allowed_channel_ids` are simply absent from the resolved list,
  so requesting one is indistinguishable from requesting a channel that does not exist.
- The webhook switches on the event type. `payment.detected` means seen on-chain, not
  confirmed; treating it as paid would hand out a pass for a transaction that can
  still fail. Redelivery returns early rather than re-marking, so a replayed webhook
  cannot keep extending a running pass.

## Tables

| Table | Purpose |
|---|---|
| `iptv_shares` | the owner's public, priced listing |
| `iptv_share_grants` | a paid pass; also the per-payment ledger |
| `iptv_share_sessions` | live streams — what enforces the concurrency cap |

Migration: `supabase/migrations/20260819170000_iptv_resale_shares.sql`.
