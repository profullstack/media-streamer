# Product Requirements Document
## Finance — Charts + AI Stock Analysis

**Version:** 1.0
**Date:** June 16, 2026
**Status:** Draft

> **Stack note:** This PRD is written against the media-streamer (BitTorrented) stack as it
> exists today — Next.js 16 App Router, React 19, TypeScript, Supabase Postgres (RLS via
> `profiles.account_id = auth.uid()`), CoinPayPortal crypto billing (`src/lib/payments`,
> `src/lib/coinpayportal`), the `openai` SDK already in `package.json`, `tsx` workers, and
> Vitest/TDD. It deliberately **reuses patterns proven in `~/src/b1dz.com`**: the
> [`lightweight-charts`](https://github.com/tradingview/lightweight-charts) v5 charting wrapper,
> the broker **`source-*` plugin** model for connecting trading accounts, encrypted broker
> credentials in a per-user settings row, and a daemon/worker that keys off a per-user
> "source enabled" toggle. Where b1dz's analysis engine is *quantitative* (indicators /
> backtests), this feature adds an **LLM-authored narrative report** instead.

---

## 1. Overview

Add a **Finance** section to media-streamer, available to **paid users only**, that lets a member:

1. **View charts** for public equities/ETFs (and later crypto) without connecting anything, and
2. Optionally **connect a brokerage / trading account** (read-only) to see their own holdings
   and positions overlaid on those charts, and
3. On explicit demand (a button click), generate an **AI-authored research report** for a ticker
   at `/finance/ticker/:ticker` — a long-form narrative thesis in the spirit of a
   [Simply Wall St community narrative](https://simplywall.st/community/narratives) (catalysts,
   risks, valuation framing, bull/bear cases), clearly labeled **not financial advice**.

The section lives under the slug **`/finance`**, with per-ticker reports at
**`/finance/ticker/:ticker`**. AI analysis is **never** run on page load — it only runs when an
authenticated, paid user clicks **Analyze**, because each run costs LLM tokens and upstream data
calls.

### Goals
1. Ship a paid-gated `/finance` hub with a fast, dependency-light charting experience reusing the
   same `lightweight-charts` v5 library as b1dz.
2. Render `/finance/ticker/:ticker` for any valid symbol with a price/volume chart and key stats,
   viewable by any paid user **without** spending LLM tokens.
3. Generate an on-demand, cached **AI report** per ticker, gated behind login **and** an active
   paid subscription, behind an explicit button.
4. Let a paid user **connect a read-only brokerage account** via a `BrokerProvider` plugin
   abstraction, storing credentials encrypted, never taking custody of funds or write/trade scope.
5. Keep market data behind a `MarketDataProvider` abstraction so we are not locked to one vendor.

### Non-Goals (v1)
- **No order placement / trading.** Brokerage connections are **read-only** (positions, balances,
  account value). No buy/sell, no transfers, ever, in v1.
- **No real-time tick streaming.** Delayed/EOD or short-poll quotes are fine at launch; no
  websocket fan-out like b1dz's daemon (revisit later).
- **No portfolio optimization, tax-lot, or P&L accounting engine.**
- **No options chains, futures, or level-2 order book.**
- **No fiat billing.** Crypto-only via CoinPayPortal, consistent with the rest of the platform.
- **No financial advice.** Reports are informational/entertainment; we are not an RIA.
- **No free-tier access.** Finance is a paid feature (trial counts as paid per current tier model).

---

## 2. Users & Use Cases

- A paid member opens **Finance**, types `NVDA`, and reads the chart + key stats with zero AI cost.
- A member clicks **Analyze NVDA** and, after ~10–30s, reads an AI narrative: business summary,
  recent catalysts, bull case, bear case, valuation framing, and risks — with sources and a
  prominent disclaimer.
- A member connects their **Alpaca / Tradier / Schwab** account read-only and sees their own
  positions and cost basis annotated on the chart and in a holdings table.
- A member re-opens a ticker they analyzed last week and sees the **cached report** with its
  "generated at" timestamp, and can click **Refresh analysis** to regenerate.

### Permission matrix

| Capability                              | Anonymous | Logged-in, unpaid | Paid (trial/premium/family) |
|-----------------------------------------|-----------|-------------------|-----------------------------|
| See `/finance` nav item                 | No        | No                | Yes (`requiresPaid`)        |
| View charts + key stats                 | No        | No                | Yes                         |
| Trigger AI report (Analyze button)      | No        | No                | Yes                         |
| View an already-generated cached report | No        | No                | Yes                         |
| Connect a read-only brokerage account   | No        | No                | Yes                         |

---

## 3. Functional Requirements

### 3.1 Finance hub (`/finance`)
- Symbol search/lookup (typeahead) resolving to a canonical ticker + exchange.
- Watchlist of tickers scoped to the active profile (reuse the existing watchlist UX language).
- Recently viewed / recently analyzed tickers.
- Entry points into `/finance/ticker/:ticker`.

### 3.2 Ticker page (`/finance/ticker/:ticker`)
- Price + volume **candlestick chart** (`lightweight-charts` v5) with selectable ranges
  (1D, 5D, 1M, 6M, 1Y, 5Y) sourced from the `MarketDataProvider`.
- Key stats panel: last price, day change %, market cap, P/E, 52-week range, volume, etc.
  (whatever the provider returns; render defensively).
- **Analyze** button (the only thing that spends LLM tokens). Disabled with an explanatory
  tooltip for unauthenticated/unpaid users; the route is paid-gated regardless of the button.
- AI report area: empty state with the Analyze CTA, a generating/loading state, and a rendered
  report state showing the stored narrative, generated-at timestamp, model used, and a
  **Refresh analysis** action.
- If the connected-account feature is on and the user holds the symbol, annotate the chart with
  cost basis / position size and show a small holdings row.

### 3.3 AI report generation
- Triggered **only** by an authenticated, paid user clicking Analyze (or Refresh).
- Server route enforces auth + active subscription **before** any upstream call (defense in depth;
  never trust the client's button state).
- Pipeline: gather inputs (recent price action + key fundamentals + recent headlines from the
  existing news/RSS extraction stack where available) → build a structured prompt → call the
  `openai` client → parse into a typed, sectioned report → persist.
- Output is a **structured report** (typed sections: summary, catalysts, bull case, bear case,
  valuation, risks, sources) so we render consistently and can evolve the layout.
- **Caching:** store the generated report keyed by `(ticker, model, prompt_version)` with a
  freshness window (default 24h). Repeat views read the cache; Refresh forces regeneration.
- **Rate limiting & cost control:** per-user and global caps on generations per day; a hard token
  budget per report; log token usage and provider cost per generation.
- Every report carries a non-removable **"Not financial advice"** disclaimer and lists sources.

### 3.4 Brokerage account connection (read-only)
- A `BrokerProvider` plugin contract (mirroring b1dz's `source-*` packages such as `source-alpaca`,
  `source-tradier`, `source-schwab`, `source-ibkr`, `source-tradestation`, `source-webull`).
- v1 ships **one** provider end-to-end (recommend **Alpaca**, OAuth or API-key, clean read-only
  scope) behind the abstraction; others are follow-on.
- Connect flow stores credentials/tokens **encrypted** in a per-user settings row; we request the
  **narrowest read-only scope** the broker offers. We never store plaintext secrets and never
  request trade/withdraw scope.
- A `tsx` worker (or on-demand server fetch in v1) syncs positions/balances into Supabase, keyed
  off a per-user **"finance source enabled"** toggle (same shape as b1dz's `source_state` row).
- Disconnect must revoke/delete stored credentials and purge synced holdings.

---

## 4. Data Model

All profile-scoped tables enforce RLS through `profiles.account_id = auth.uid()`.

- `finance_watchlist` — profile-scoped tickers (symbol, exchange, added_at).
- `finance_reports` — generated AI reports keyed by `(symbol, model, prompt_version)`:
  structured JSON sections, raw markdown, sources, token usage, cost, generated_by (profile),
  generated_at, freshness/expiry. Readable by paid users; writes server-only (service role).
- `finance_report_runs` — audit/rate-limit ledger: who generated what, when, tokens, cost,
  success/failure (drives per-user/day caps and spend dashboards).
- `finance_broker_connections` — profile-scoped broker links: provider id, encrypted
  credentials/tokens, scope, status, last_sync_at. Secrets encrypted at rest; never returned to
  the client.
- `finance_holdings` — profile-scoped synced positions (symbol, qty, avg cost, market value,
  as_of). Purged on disconnect.

Consider a non-profile-scoped `finance_quotes_cache` (symbol → last quote/candles) to cut upstream
calls across users; cache only public market data there.

---

## 5. API (App Router routes under `src/app/api/finance/`)

- `GET  /api/finance/quote?symbol=` — last price + key stats (paid-gated).
- `GET  /api/finance/candles?symbol=&range=` — OHLCV for the chart (paid-gated, cacheable).
- `GET  /api/finance/search?q=` — symbol lookup/typeahead.
- `GET  /api/finance/report?symbol=` — return the cached report if fresh, else 404/empty.
- `POST /api/finance/report` — **generate/refresh** a report (auth + active paid subscription
  enforced first; rate-limited; the only token-spending route).
- `GET    /api/finance/watchlist` / `POST` / `DELETE` — manage the profile watchlist.
- `POST   /api/finance/broker/connect` — begin/store a read-only broker connection.
- `DELETE /api/finance/broker/connect?id=` — disconnect + purge holdings.
- `GET    /api/finance/holdings` — synced positions for the active profile.

Every route calls the existing auth helper (`getCurrentUserWithSubscription()`), then checks
`isSubscriptionActive(...)` (and a `finance` feature gate) before doing work.

---

## 6. UX Requirements

- Add a sidebar item: `{ href: '/finance', label: 'Finance', icon: <FinanceIcon>, requiresPaid: true }`
  in `src/components/layout/sidebar.tsx`, matching the existing `requiresPaid` items
  (`/upcoming`, `/news`). Unpaid users are routed to pricing/login like other gated items.
- Charts must use `lightweight-charts` v5 wrapped in a `'use client'` component (port the b1dz
  `trading-chart.tsx` pattern: `createChart` + `CandlestickSeries` + `HistogramSeries`, resize
  handling, theme-aware colors). Render defensively against missing/partial data.
- The **Analyze** button is the explicit, visible cost boundary — show estimated wait and a clear
  loading state; never auto-run on navigation.
- Reports render from typed sections with a sticky, prominent **"Not financial advice"** banner
  and a visible sources list and generated-at timestamp.
- Mobile: stacked chart → stats → report; no overlapping toolbars (consistent with other sections).

---

## 7. Technical Design

- Domain logic under `src/lib/finance/` (`market-data/`, `analysis/`, `brokers/`), API in
  `src/app/api/finance/`, pages under `src/app/finance/`.
- **`MarketDataProvider`** abstraction (interface + one concrete adapter in v1) so quotes/candles
  vendor is swappable. Candidate adapters: a delayed/EOD quotes API for "just view charts"; the
  connected broker's market-data endpoints where available.
- **`BrokerProvider`** abstraction copied in spirit from b1dz's `source-*` packages; v1 implements
  Alpaca read-only. Credentials encrypted via the existing settings/encryption approach.
- **AI:** reuse the project's existing `openai` SDK. Centralize the prompt in a versioned template
  (`prompt_version`) so cache keys invalidate when the prompt changes. Parse into typed sections;
  store both structured JSON and rendered markdown. Capture token usage + cost on every run.
- **Caching/cost:** read-through cache for quotes/candles; report cache with freshness window;
  per-user/day generation caps recorded in `finance_report_runs`.
- **Workers:** holdings sync follows the existing `tsx` worker pattern (`workers/`), gated by the
  per-user source-enabled toggle; v1 may start with on-demand server-side sync and add the worker
  when load warrants.
- Follow Vitest/TDD: contract tests for each provider adapter, the report parser, the gating
  middleware, and the rate limiter.

---

## 8. Security, Privacy & Compliance

- **Brokerage = read-only, no custody.** Never request trade/withdraw scope; never hold funds.
- Encrypt all broker credentials/tokens at rest; never return secrets to the client; redact in logs.
- Enforce auth + active subscription **server-side on every route** — the disabled button is UX
  only, not a security control.
- Rate-limit and budget LLM spend per user and globally; alert on anomalous spend.
- **"Not financial advice"** disclaimer is mandatory and non-dismissible on every report; we are
  not a registered investment adviser. Legal review of disclaimer copy before launch.
- Respect upstream data-vendor ToS (attribution, redistribution, delayed-data labeling).
- RLS on every profile-scoped table; service-role writes only for reports/holdings.

---

## 9. Milestones

### M1 — Charts + paid gating (no AI, no brokers)
PRD, migration for `finance_watchlist` + `finance_quotes_cache`, `MarketDataProvider` interface +
one adapter, `/api/finance/quote|candles|search|watchlist`, `lightweight-charts` wrapper ported
from b1dz, `/finance` hub + `/finance/ticker/:ticker` pages, sidebar `requiresPaid` item, gating
tests. **Exit:** a paid user views any ticker's chart + stats; unpaid users are blocked.

### M2 — On-demand AI report
`finance_reports` + `finance_report_runs` migrations, versioned prompt template, `openai`-backed
analysis pipeline, `GET/POST /api/finance/report` with auth + paid enforcement, caching,
per-user/day rate limits, token/cost logging, typed report renderer with disclaimer + sources,
Analyze/Refresh UX. **Exit:** a paid user generates and re-reads a cached report; spend is capped
and logged.

### M3 — Read-only brokerage connection (Alpaca)
`BrokerProvider` contract + Alpaca adapter, encrypted credential storage, connect/disconnect flow,
holdings sync (on-demand → worker), `finance_broker_connections` + `finance_holdings` migrations,
holdings overlay on chart + table. **Exit:** a paid user links Alpaca read-only and sees their
positions annotated; disconnect purges data.

### M4 (later) — More brokers, richer reports, freshness automation
Additional `source-*` adapters, scheduled report refresh for watchlisted tickers, crypto symbols,
comparison/peer context in reports.

---

## 10. Open Questions

1. **Market-data vendor for M1** — which delayed/EOD quotes+fundamentals API (cost, ToS,
   redistribution, attribution)? Drives the first `MarketDataProvider` adapter.
2. **AI model + budget** — which `openai` model, target tokens/report, and per-user/day caps that
   keep margins positive at the current subscription price?
3. **Report freshness window** — 24h default; should watchlisted tickers auto-refresh (M4)?
4. **Trial users** — current tier model treats `trial` like `premium`; confirm trial users get full
   Finance access or whether AI generation is `premium`/`family`-only to bound trial-abuse cost.
5. **First broker** — confirm Alpaca as the v1 read-only provider vs. Tradier/Schwab.
6. **Disclaimer scope** — legal sign-off on "not financial advice" copy and any geo restrictions.
