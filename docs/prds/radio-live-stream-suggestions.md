# Product Requirements Document
## News & Sports Suggestions for Live Radio Streams

**Version:** 2.0
**Date:** June 7, 2026
**Status:** Draft

## 1. Overview

Add a suggestions layer to BitTorrented's Live Radio interface (`/radio`) that recommends **which live radio streams to tune into** in the News and Sports categories. Today the interface lists SiriusXM Sports/News stations and the user's favorites, but the user has to know what they want. This feature surfaces a ranked set of suggested live radio streams driven by what is happening right now — trending news topics, live sporting events, and the user's own listening history and favorites — so that opening `/radio` answers "what should I listen to right now?".

The suggested items are **live radio streams** the user plays in the existing radio player. The "news and sports" signals (trending headlines, live event context) are used to decide *which* live radio streams to surface and to explain *why* — they are not separate video content.

### Goals
- Show a "Suggested for you" section of live radio streams on `/radio`, segmented by Sports and News.
- Rank suggested streams using: live/now-relevant context (trending news topics, in-progress sports events), the user's favorites and recent listening, and station now-playing metadata.
- Give each suggestion a short, honest "why" (e.g., "Live now: NBA Finals", "Trending: <topic>", "Because you favorited <station>").
- Let a user play a suggested stream with one click in the existing radio player.
- Keep suggestions profile-scoped and reuse existing radio, RSS/news, and favorites code.

### Non-Goals
- No new audio/video sources beyond the live radio streams the interface already supports (SiriusXM stations, user favorites, and custom stream URLs).
- No IPTV/Live TV video suggestions in this feature (live radio only).
- No torrent/DHT on-demand results in the radio suggestions.
- No editorial/curated suggestion feed maintained by BitTorrented.
- No cross-profile or social "what others are listening to" recommendations in the first milestone.
- No automatic playback; suggestions are surfaced, the user chooses to play.

## 2. Users And Use Cases

- A user opens `/radio` during a major game and immediately sees the sports radio stream covering it suggested at the top, with a "Live now" reason.
- A user opens `/radio` during a breaking news event and sees the relevant news radio stream suggested, with a "Trending" reason tied to current headlines.
- A returning user sees suggestions weighted toward stations similar to their favorites and recent listening.
- A new user with no history sees sensible defaults: popular/now-relevant Sports and News streams rather than an empty section.
- A user dismisses or plays a suggestion; playing opens the existing radio player modal.

## 3. Functional Requirements

### Suggestion Sourcing
- Candidate live radio streams come from the existing radio catalog: SiriusXM Sports and News stations, the active profile's favorites, and previously played custom streams.
- Build a relevance **context** from current signals:
  - **News topics:** trending terms derived from the active profile's RSS items and the existing news stack (recent, high-signal headlines), tokenized into a keyword set.
  - **Sports/live context:** in-progress or imminent events inferred from station now-playing metadata (`currentTrack`) and station name/genre (e.g., league/team terms). (A dedicated sports-schedule source is a later-milestone enhancement; M1 relies on station metadata and keywords.)
  - **User signal:** the profile's favorites and recent listening history.
- Match candidate streams against the context by token overlap on station `name`, `genre`, `description`, and `currentTrack`.

### Ranking
- Sports suggestions ranked by: live/now-relevant match (now-playing/event keywords) > similarity to favorites/recent listening > station reliability/popularity.
- News suggestions ranked by: trending-topic overlap > similarity to favorites/recent listening > recency of now-playing metadata.
- Each suggestion carries a machine-generated `reason` for display.
- Cap each category to a configurable limit (default 8) and de-duplicate by station id; never suggest a stream that is currently playing.
- Always return a non-empty default set when signals are sparse (popular Sports/News stations), so the section is never empty.

### Interaction
- Suggestions render in their own section on `/radio`, above or alongside the existing Sports/News/Favorites tabs.
- Clicking a suggested stream opens the existing `RadioPlayerModal` and plays it, honoring the user's selected quality.
- Suggestions refresh on page load, on tab change between Sports and News, and after the user favorites/plays a station.
- A suggestion shows: station name, image, category badge, and its `reason` line.

### API
- `GET /api/radio/suggestions?category=<sports|news>&limit=<n>` returns `{ suggestions: StreamSuggestion[], context: { keywords: string[] } }` for the active profile.
- The endpoint assembles candidates and context server-side from the radio catalog, the profile's favorites/history, and RSS/news signals; it must never fetch cross-origin content from the client.
- Empty or weak context returns the default popular set with `200`, not an error.

## 4. Data Model

No new persistent tables are strictly required for M1; suggestions are computed on demand. Optional additions support history-based ranking and tuning:

- Reuse `RadioStation` (`id`, `name`, `genre`, `description`, `currentTrack`, `reliability`) as both candidate and context source.
- Reuse `RadioStationFavorite` (profile-scoped) for the user signal.
- Reuse `rss_feed_items` / `rss_subscriptions` (profile-scoped) for trending-topic extraction.
- Optional `radio_listening_history` (profile-scoped): recently played stations with timestamps, to power "similar to what you listen to" and to exclude the currently playing stream. RLS via `profiles.account_id = auth.uid()`.
- Optional `radio_suggestion_events` (profile-scoped): impression/click/play log for relevance tuning. RLS-enforced.

Derived type (no migration):
- `StreamSuggestion`: `{ station: RadioStation, category: 'sports' | 'news', score: number, reason: string }`.

## 5. UX Requirements

- Suggestions appear on `/radio` as a dedicated "Suggested for you" section, visually distinct from the manual Sports/News/Favorites browsing tabs.
- Sports and News suggestions are grouped (separate rows/rails or filtered by the active tab), each card showing station image, name, category badge, and the `reason` line.
- The section must always render content (defaults when signals are weak); it must never show a bare empty state on a populated radio catalog.
- Loading must not block the existing station list or playback; use independent skeletons.
- Mobile layout uses stacked, swipeable rails without overlapping the radio player controls.
- Must remain performant on low-power devices (Fire Stick/Silk): memoized suggestion cards, lazy images with fallback, capped suggestion counts.

## 6. Technical Design

- Use a Next.js App Router API route at `src/app/api/radio/suggestions/route.ts` for server-side assembly.
- Put context-extraction, candidate-gathering, matching, and ranking logic under `src/lib/radio/suggestions` (pure, unit-tested).
- Reuse the existing radio service (`src/lib/radio`) for the station catalog and now-playing metadata, `RadioStationFavorite` access for the user signal, and `src/lib/rss-reader` + `src/lib/news` for trending-topic extraction.
- Reuse the existing `RadioPlayerModal` and `useRadio*` hooks for playback; suggestions are just another source of `RadioStation` objects.
- Use the existing server-side Supabase client and active-profile selection; enforce profile scoping/RLS.
- Keep M1 matching deterministic and dependency-light (tokenize, lowercase, stopword filter, overlap score); defer embedding/LLM-based topic modeling to a later milestone for latency/cost.
- Avoid client-side cross-origin fetches; all catalog/RSS/news access is server-side.

## 7. Milestones

### M1 Suggestion Engine + API
- PRD, `src/lib/radio/suggestions` (context extraction from RSS/news + favorites, candidate gathering from the radio catalog, scoring with reasons, default fallback set), `GET /api/radio/suggestions`, unit tests for ranking, reason generation, dedup/exclusion, and default behavior.

### M2 Radio UI Suggestions Section
- "Suggested for you" section on `/radio` for Sports and News, wired to the radio player, with reasons, defaults, skeletons, and tab-aware refresh.

### M3 History + Live Context + Tuning
- Add `radio_listening_history` to power similarity ranking and current-stream exclusion; add `radio_suggestion_events` logging and relevance tuning; optionally integrate a dedicated sports-schedule/live-event source to sharpen "live now" sports suggestions.

## 8. Success Metrics

- On `/radio`, the Suggested section returns relevant Sports and News live radio streams in one request cycle, each with a reason.
- During trending news or in-progress sports periods, the top suggestion reflects the current context (verifiable via the `reason` and keyword context).
- A user can play any suggested stream in one click via the existing radio player.
- Suggestions are isolated per profile; no cross-profile leakage.
- The section never renders empty on a populated catalog; weak signals fall back to a sensible default set.
- Suggestion assembly stays within an acceptable latency budget on low-power devices and does not block the station list or playback.
