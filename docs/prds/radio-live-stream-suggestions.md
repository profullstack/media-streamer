# Product Requirements Document
## Live Stream Suggestions on the Live Radio Interface

**Version:** 1.0
**Date:** June 7, 2026
**Status:** Draft

## 1. Overview

Add news and sports suggestions to BitTorrented's Live Radio interface (`/radio`) so that, while a user browses or listens to a SiriusXM Sports or News station, the page surfaces a ranked rail of related **live video streams** and **relevant headlines**. The goal is to turn the audio-only radio experience into a launch point: a listener tuned to an NBA play-by-play station should be one click from the live TV broadcast of that game; a listener on a news station should see matching live news channels and current headlines.

Suggestions are assembled entirely from existing BitTorrented data the user already owns or subscribes to — their Live TV (IPTV) playlists, their RSS subscriptions, and the news extraction/summarization stack — and matched to the radio station's category, name, genre, and now-playing metadata. No new third-party content sources are introduced in the first milestone.

### Goals
- Show a "Watch live" rail on `/radio` suggesting Live TV channels relevant to the active or focused radio station.
- Show a "Related headlines" rail suggesting recent news items relevant to the station's topic.
- Rank suggestions by relevance using station category (sports/news), station name/genre, and current track/EPG signals.
- Let a user open a suggested live TV stream in the existing HLS player without leaving the radio context.
- Keep all suggestions profile-scoped and reuse existing Live TV, RSS, and news code.

### Non-Goals
- No new external sports-data or news-API integrations in the first milestone (suggestions draw only from the user's own IPTV playlists, RSS subscriptions, and existing news endpoints).
- No automatic switching of audio to a video stream's audio track.
- No editorial/curated suggestion feed maintained by BitTorrented.
- No cross-profile or social "what others are watching" recommendations.
- No torrent/DHT on-demand results in the radio suggestions rail (live streams only).

## 2. Users And Use Cases

- A user listening to a SiriusXM Sports station sees their Live TV sports channels that are likely carrying the same event and opens one in the HLS player.
- A user on a News station sees matching live news TV channels plus the latest related headlines from their RSS subscriptions.
- A user browsing (not yet playing) the Sports or News tab sees suggestions for the focused/first station so the rail is useful before playback starts.
- A user with no IPTV playlists or RSS feeds sees an empty-state prompt explaining how suggestions populate (link to `/live-tv` and `/rss`).
- A user opens a suggested headline and triggers the existing extraction/summarization/TTS endpoints.

## 3. Functional Requirements

### Suggestion Sourcing
- Derive a suggestion **context** from the active station (or, when nothing is playing, the focused/first station in the current tab): category (`sports`/`news`), station name, genre, description, and `currentTrack` when present.
- Build a keyword set from the context: tokenized station name/genre/track plus category synonyms (e.g., sports league/team terms, "breaking", "headlines").
- **Live TV suggestions:** match the user's IPTV channels by `group`/`groupTitle` (Sports/News) and by name/`tvgId` token overlap with the context keywords. Where an EPG (`epgUrl`) is available, prefer channels whose now-playing programme title overlaps the context.
- **Headline suggestions:** match the active profile's RSS feed items by title/summary token overlap with the context keywords, filtered to recent items, unread-first.
- Both rails must degrade gracefully: missing IPTV playlists, missing RSS subscriptions, or missing EPG must each produce an empty rail with guidance rather than an error.

### Ranking
- Rank Live TV suggestions by: category match (exact group) > name/tvg token overlap score > EPG now-playing overlap > playlist freshness.
- Rank headlines by: token overlap score > recency > unread state.
- Cap each rail to a configurable limit (default 12) and de-duplicate by channel id / item id.

### Interaction
- Clicking a Live TV suggestion opens the existing `HlsPlayerModal` with the channel, reusing the Live TV proxying path for HTTP/HTTPS compatibility.
- Clicking a headline opens it through the existing news article flow (extraction/summarization), consistent with `/rss`.
- Suggestions refresh when the active/focused station changes and when the user switches Sports/News tabs.
- Radio playback continues uninterrupted while a user inspects suggestions; opening a video stream is an explicit user action.

### API
- `GET /api/radio/suggestions?stationId=<id>&category=<sports|news>&limit=<n>` returns `{ liveStreams: ChannelSuggestion[], headlines: HeadlineSuggestion[], context: { keywords: string[] } }` for the active profile.
- The endpoint reads the active profile's IPTV playlists and RSS items server-side; it must never fetch cross-origin content from the client.
- Inputs are validated; unknown/empty context returns empty rails with `200`, not an error.

## 4. Data Model

No new persistent tables are required for the first milestone; suggestions are computed on demand from existing data.

- Reuse `Channel` (IPTV) including `group`/`groupTitle`, `tvgId`, `epgUrl`, `logo`, and stream `url`.
- Reuse `RadioStation` (`id`, `name`, `genre`, `description`, `currentTrack`) as the context source.
- Reuse `rss_feed_items` / `rss_subscriptions` / `rss_item_states` for headline candidates (profile-scoped, RLS via `profiles.account_id = auth.uid()`).
- Optional (later milestone) `radio_suggestion_events`: profile-scoped click/impression log for tuning relevance, RLS-enforced.

Derived types (no migration):
- `ChannelSuggestion`: `{ channel: Channel, score: number, reason: 'group' | 'name' | 'epg' }`.
- `HeadlineSuggestion`: `{ item: RssFeedItem, score: number }`.

## 5. UX Requirements

- Suggestions appear on the existing `/radio` page as two horizontally scrollable rails below the station grid (or in a right column on large screens): "Watch live" and "Related headlines".
- Each Live TV suggestion shows channel logo, name, group badge, and a short "why" reason (e.g., "Sports • matches ESPN").
- Each headline shows source/feed, title, and relative time.
- Empty states must be explicit and actionable: link to `/live-tv` to add playlists and `/rss` to add feeds.
- Mobile layout uses stacked, swipeable rails without overlapping the radio player controls.
- Suggestion loading must not block the radio station list or playback; use independent loading/skeleton states.
- Must remain performant on low-power devices (Fire Stick/Silk): memoized suggestion cards, lazy logos with fallback, capped rail length.

## 6. Technical Design

- Use a Next.js App Router API route at `src/app/api/radio/suggestions/route.ts` for server-side assembly.
- Put matching/ranking logic under `src/lib/radio/suggestions` (pure, unit-tested: context extraction, keyword build, scoring).
- Reuse `src/lib/iptv` for channel parsing/lookup and EPG access; reuse `src/lib/rss-reader` for the active profile's items; reuse `src/lib/news/article-extractor.ts` for headline reading.
- Reuse the existing radio service for station metadata and the Live TV `HlsPlayerModal` + radio/live-tv proxy routes for playback.
- Use the existing server-side Supabase client and active-profile selection pattern; enforce profile scoping/RLS.
- Keyword matching should be deterministic and dependency-light (tokenize, lowercase, stopword filter, overlap score); avoid embedding/LLM calls in M1 for latency and cost.
- Avoid client-side cross-origin fetches; all IPTV/RSS/EPG access is server-side.

## 7. Milestones

### M1 Suggestion Engine + API
- PRD, `src/lib/radio/suggestions` (context extraction, keyword build, channel + headline scoring), `GET /api/radio/suggestions`, unit tests for ranking and empty-state behavior.

### M2 Radio UI Rails
- "Watch live" and "Related headlines" rails on `/radio`, wired to the focused/active station, opening the existing HLS player and news flow, with empty states and skeletons.

### M3 EPG-Aware Matching + Tuning
- Use IPTV EPG now-playing titles to sharpen sports matching; add `radio_suggestion_events` logging and relevance tuning; optional caching of suggestion results per (station, profile) with short TTL.

## 8. Success Metrics

- For a profile with at least one IPTV playlist, a Sports or News station returns at least one relevant live-stream suggestion in one request cycle.
- For a profile with RSS subscriptions, a station returns relevant headlines ranked unread-first.
- Opening a suggested live stream launches the existing HLS player without interrupting radio playback until the user chooses to play video.
- Suggestions are isolated per profile; no cross-profile leakage.
- Empty states (no playlists/feeds) render guidance, never errors.
- Suggestion assembly stays within an acceptable latency budget on low-power devices and does not block the station list or playback.
