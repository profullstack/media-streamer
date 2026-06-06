# Product Requirements Document
## RSS Reader

**Version:** 1.0
**Date:** June 6, 2026
**Status:** Draft

## 1. Overview

Add a profile-scoped RSS reader to BitTorrented so users can subscribe to standard RSS/Atom feeds, browse recent articles, mark read/saved state, and open source articles through the existing news extraction and summarization stack.

### Goals
- Let each profile subscribe to multiple RSS or Atom feeds by URL.
- Fetch and normalize feed metadata plus recent entries.
- Show a unified unread-first article list for the active profile.
- Track read, saved, and read-later state per profile.
- Reuse existing server-side Supabase access, profile selection, and article extraction code.

### Non-Goals
- No feed discovery directory in the first milestone.
- No full offline reader cache beyond feed item metadata.
- No paid publisher bypass or paywall handling.
- No social sharing or collaborative folders in the first milestone.

## 2. Users And Use Cases

- A profile subscribes to blogs, newsletters with feed URLs, software release feeds, and news sites.
- A user scans unread headlines across all feeds.
- A user opens an article and optionally triggers existing extraction/summarization endpoints.
- A user marks articles read, unread, or saved.

## 3. Functional Requirements

### Feed Management
- Add a feed by HTTP or HTTPS URL.
- Import an OPML file and subscribe to every valid RSS/Atom outline.
- Parse RSS 2.0 and Atom feeds.
- Store canonical feed URL, title, description, site URL, image URL, language, and last fetch metadata.
- Prevent duplicate feed subscriptions for the same profile.
- Allow update of per-profile feed settings including custom title, folder, and notification preference.
- Allow delete/unsubscribe without deleting global feed/item cache used by other profiles.

### Feed Refresh
- Fetch feed XML server-side with timeout and size limits.
- Upsert feed items by stable GUID when available, otherwise by link.
- Store title, summary/content snippet, author, link, published timestamp, enclosure metadata, and raw source identifiers.
- Track fetch errors and last successful refresh.

### Reader State
- Track per-profile item state: read/unread, saved, read_at, saved_at.
- Default new feed items to unread for subscribed profiles.
- Support filtering by feed, unread, saved, and date range.

### API
- `GET /api/rss` lists active profile subscriptions and recent items.
- `POST /api/rss` subscribes to a feed by URL and refreshes it.
- `PATCH /api/rss?feedId=<id>` updates the active profile's feed subscription settings.
- `DELETE /api/rss?feedId=<id>` unsubscribes the active profile.
- `POST /api/rss/import` accepts OPML upload/import and subscribes to valid feeds.
- `POST /api/rss/[feedId]/refresh` refreshes one feed.
- `PATCH /api/rss/items/[itemId]` updates read/saved state.

## 4. Data Model

- `rss_feeds`: global feed metadata keyed by feed URL.
- `rss_feed_items`: global normalized items keyed by feed and GUID/link.
- `rss_subscriptions`: profile-scoped feed subscriptions, custom title, folder, and notification preferences.
- `rss_item_states`: profile-scoped item read/saved state.

All profile-scoped tables must enforce RLS through the `profiles.account_id = auth.uid()` relationship.

## 5. UX Requirements

- The first full UI should live at `/rss`.
- Layout should prioritize dense scanning: left feed list, central article list, right or modal article preview on larger screens.
- Mobile layout should use tabs or stacked views without overlapping toolbar text.
- Feed errors should be visible but not block other feeds.

## 6. Technical Design

- Use Next.js App Router API routes for server operations.
- Put domain logic under `src/lib/rss-reader`.
- Use existing Supabase server client pattern.
- Reuse `src/lib/news/article-extractor.ts` for full article reading where applicable.
- Avoid client-side cross-origin feed fetching.

## 7. Milestones

### M1 Backend Contract
- PRD, migration, RSS/Atom parser, OPML parser, repository/service, API routes, unit tests.

### M2 Reader UI
- `/rss` page with subscriptions, article list, read/saved state, and refresh controls.

### M3 Background Refresh
- Scheduled refresh worker or cron endpoint, rate limits, stale-feed backoff.

## 8. Success Metrics

- A user can subscribe to a valid RSS or Atom URL and see items in one request cycle.
- A user can import an OPML file and receive per-feed import results.
- Duplicate subscriptions do not create duplicate feeds or items.
- A user can rename, organize, and delete feed subscriptions without affecting other profiles.
- Read/saved state is isolated per profile.
- Failed feed refreshes return useful errors and preserve existing items.
