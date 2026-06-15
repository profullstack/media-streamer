# Product Requirements Document
## Managed Seedbox Reseller + Bring-Your-Own-Server Control Plane

**Version:** 1.0
**Date:** June 15, 2026
**Status:** Draft

> **Stack note:** This PRD is rewritten against the BitTorrented stack as it exists today
> (Next.js 16 App Router, React 19, TypeScript, Supabase Postgres, CoinPayPortal crypto
> billing, DigitalOcean Droplet deployment, `tsx` workers, Vitest/TDD). Where the original
> draft assumed a greenfield build on WHMCS and an unnamed "CoinPay" gateway, this version
> reuses what we already have: `src/lib/payments/` (CoinPayPortal), our Supabase data layer,
> our DigitalOcean deploy tooling, and our worker pattern. WHMCS is explicitly rejected (§5.2).

---

## 1. Overview

A control plane, built into BitTorrented, that (a) **resells managed seedboxes** provisioned
programmatically on commodity infrastructure at a markup, and (b) lets users **connect their own
servers** ("Bring Your Own Server" / BYOS) to get the same management dashboard without us hosting
anything.

Billing is in **cryptocurrency via CoinPayPortal** — the same gateway already wired into BitTorrent
premium subscriptions (`src/lib/payments/`). Crypto removes card-processor "high-risk merchant"
rejection and chargebacks, but changes how subscriptions work (see §7).

The single most important design decision: **we never take custody of a customer's private SSH
key.** The trustworthy model is the inverse — the customer authorizes *our* key on *their* box and
can revoke it at any time (§6).

### Goals
1. A customer can purchase a managed seedbox and have it provisioned and reachable **in under 10
   minutes**, paying in crypto via CoinPayPortal.
2. A customer can connect their own server (BYOS) **without uploading any private key or password to
   us** on the default, recommended path.
3. Upstream capacity is purchased **programmatically** behind a `ProvisioningProvider` abstraction,
   so we are not locked to one host.
4. Gross margin per managed seat is **predictable and positive** after fees, abuse handling, and
   support — not just nominal "2× wholesale."
5. We can **suspend, terminate, and revoke** any resource (ours or a BYOS connection) cleanly and on
   demand, with a full audit trail in Supabase.

### Non-Goals (v1)
- **Owning hardware / a datacenter.** We resell or manage commodity capacity; we don't rack servers.
- **Custodial private-key storage as the default.** Out of scope as a default; only a tightly-scoped,
  high-friction fallback exists (§6.4).
- **An anonymity/piracy product.** This is a hosting-management tool with a real Acceptable Use Policy
  and DMCA process (§8). Marketing that promises infringement is out of scope and a legal liability.
- **Fiat / card payments.** Deferred; crypto-only at launch (consistent with the rest of BitTorrented).
- **A WHMCS or third-party billing backbone.** We already own order/payment/lifecycle primitives.
- **Mobile-native apps.** Web-responsive PWA only at launch (matches current platform).

---

## 2. Problem & Opportunity

Seedboxes (remote servers preloaded with a torrent client, often plus Plex/\*arr tooling) are bought
from a fragmented market of boutique hosts. Buying, provisioning, and managing them is manual and
technical. Two adjacent problems:

- **Buyers** want a one-click purchase, a clean dashboard, and crypto payment — without picking a
  host, reading specs, or doing Linux setup.
- **Self-hosters** already own a VPS or home server and want the same dashboard/automation layer, but
  (rightly) do **not** want to hand their root credentials to a third party.

Opportunity: be the **billing + provisioning + management layer** on top of commodity infrastructure,
monetizing via markup on resold capacity and (optionally) a flat fee on BYOS connections. BitTorrented
already owns the hard parts — accounts, crypto billing, a streaming UI, and DigitalOcean deploy
tooling — so this is an adjacent product, not a greenfield build.

---

## 3. Capability A — Managed Seedbox Purchase & Provisioning

### 3.1 Provider integration strategy (how we actually "buy via API")

There is no single "seedbox API." There are **two viable backends**, both behind one internal
interface (`ProvisioningProvider`, §9) so plans move between them without UI changes.

| Backend | What it is | "Purchase via API" path | Trade-offs |
|---|---|---|---|
| **B1. VPS provider + auto-install** (recommended for v1) | Provision a plain VPS, then auto-install the seedbox stack | DigitalOcean API creates the Droplet; `cloud-init` (same pattern as our `scripts/setup-droplet.sh`) installs qBittorrent/ruTorrent/Deluge + optional Plex/\*arr | Cleanest API, full control, best margin. **We already deploy BitTorrented to DigitalOcean and own DO automation** — lowest new-dependency path. Check each provider's AUP re: BitTorrent traffic. |
| **B2. Seedbox reseller program** | Buy slots wholesale from a seedbox host with a reseller tier | Reseller API | Less ops burden (host runs the metal). **But:** most consumer seedbox ToS forbid "re-sharing slots"/reselling — you need an explicit reseller agreement (e.g. Pulsed Media's tiered program), which carries **volume minimums** (entry tier ~5 services / ~€500/mo). |

**Recommendation:** Ship v1 on **B1 with DigitalOcean** (we already use it; reuse `.do/` config and
`scripts/setup-droplet.sh` as the install baseline). Note DO's AUP on torrent/BitTorrent traffic
before going wide; if DO is restrictive for end-user torrenting, add Hetzner/Vultr as a second B1
provider behind the same interface. Add **B2** only in M3 after signing a real reseller agreement. Do
**not** resell consumer seedbox accounts without a written reseller contract — that violates most
hosts' ToS and risks our whole supply being terminated at once.

### 3.2 Billing & provisioning backbone — build on BitTorrented, not WHMCS

The hosting-industry default for "order → provision → invoice → suspend/terminate" is WHMCS. **We are
rejecting it.** We already own the pieces WHMCS would provide, and WHMCS cannot express the BYOS trust
model (§6) without heavy customization:

- **Orders & entitlements:** Supabase tables + Next.js API routes (same pattern as `src/lib/payments/`
  and `src/lib/library/`).
- **Crypto billing:** `src/lib/payments/` (CoinPayPortal) already does payment requests, sessions,
  on-chain confirmation, and HMAC webhook verification. We extend it with a prepaid-balance model (§7).
- **Provisioning workers:** the existing `workers/<name>/index.ts` + `Dockerfile.<name>-worker` pattern
  (as used by `iptv-cache` and `podcast-notifier`), run via `tsx`.
- **Lifecycle state machine + dunning:** a scheduled worker plus Supabase state columns and an audit
  table.

**Decision:** Build the control plane natively in the existing app. This keeps one stack, one auth
model, one deploy pipeline (GitHub Actions → DigitalOcean Droplet), and one test harness (Vitest/TDD).

### 3.3 Pricing & margin (the "2× it" question)

A flat "wholesale × 2" is fine as a *starting* sticker price, but model the real cost stack first —
wholesale is not the only cost:

- CoinPayPortal processing fee + crypto→stablecoin conversion spread
- Support load (the #1 hidden cost in hosting resale)
- Abuse/DMCA handling and the occasional terminated upstream box
- Churn + provisioning/teardown overhead
- Free trial / refund leakage

Treat margin as `price − (wholesale + fees + amortized support + abuse reserve)`. A **prepaid-credit**
model (§7) also reduces involuntary churn, which protects margin more than a higher sticker price
would. _(Business-modeling note, not financial advice.)_

### 3.4 Lifecycle

```
order placed
  → payment confirmed (CoinPayPortal webhook + on-chain confirmation)
  → provision (ProvisioningProvider.create + cloud-init stack install)
  → credentials delivered (email via @profullstack/emailer / Resend)
  → active
  → (renew | low-balance warning | suspend | terminate + secure wipe)
```

Every state transition emits an audit event (§9) and, where user-facing, an email.

### 3.5 User stories
- As a buyer, I pick a plan, pay in crypto, and receive working login details automatically.
- As a buyer, I see my balance/expiry and top up before suspension, so I don't lose data.
- As an operator, I see one dashboard of all upstream resources and their state, to reconcile what
  I'm paying for vs. billing for.
- As an operator, I one-click suspend/terminate with secure wipe, to respond to abuse or non-payment.

---

## 4. Capability B — Bring Your Own Server (BYOS): the trust model

**Storing customers' private keys (or passwords) makes us a single high-value breach target and a
liability magnet.** Don't do it as the default. The trust ladder, best → fallback:

### 4.1 Default & recommended — *customer authorizes our key* (Tier 1)

The direction of trust is reversed. Instead of the user giving us *their* secret:

1. We generate a **unique keypair per connection** on our side.
2. We show the user **our public key** and a one-line command to add it to their server's
   `~/.ssh/authorized_keys`, scoped to a dedicated non-root `seedbox-mgr` user with only the
   permissions the features need.
3. We connect using **our private key**. We hold only our own secret, never theirs.
4. The user **revokes anytime** by deleting that one line — no support ticket, no involvement from us.

Per-connection keys mean a compromise of one connection can't pivot to every customer's box. This is
the same pattern used by configuration-management and managed-monitoring tools.

### 4.2 Better for the security-conscious — *outbound agent* (Tier 1+, M3)

Offer a small, **open-source** agent the user installs. It makes an **outbound** connection to us
(reverse tunnel / message channel), so the user opens **no inbound SSH port** and adds no key for us.
Runs as a restricted user, exposes only the actions we need, and being open-source lets the wary
audit exactly what it does.

### 4.3 Highest assurance — *SSH certificate authority* (M4)

Run an SSH CA. The user adds our CA public key to `TrustedUserCAKeys`. We issue **short-lived signed
certificates** (minutes) per session: automatic expiry, clean per-session audit, no long-lived key in
`authorized_keys`. More infra; reserve for power users / teams.

### 4.4 Fallback only — *credential custody* (discouraged)

If a non-trivial segment genuinely cannot edit `authorized_keys` (rare), offer a credential-custody
path **explicitly and with friction**, never as default. Hard requirements if it exists at all:

- Secrets live in a dedicated secrets manager (e.g. cloud KMS / Vault), **never** in the Supabase app
  DB. The app stores **references**, consistent with our "all sensitive ops server-side" rule.
- **Envelope encryption**, per-tenant data keys, encryption at rest and in transit.
- Access is short-lived, brokered, fully **audit-logged**, and least-privilege (dedicated user, not
  root).
- Clear in-product disclosure of the added risk and a one-click purge.

> **Design rule:** Prefer "customer presents access to us" (Tiers 1–3) over "customer hands us a
> secret" (Tier 4) in every case.

### 4.5 BYOS user stories
- As a self-hoster, I connect my server by adding one line to `authorized_keys`, never giving anyone
  my private key.
- As a self-hoster, I revoke access myself in one step, never dependent on the vendor to cut access.
- As a privacy-focused user, I run an auditable open-source agent to verify what the service can and
  cannot do.
- As any BYOS user, I see a clear statement of exactly which commands the service runs on my box.

---

## 5. Crypto Billing (CoinPayPortal)

Crypto changes subscriptions fundamentally: **there is no "pull" like a stored card.** A processor
cannot auto-charge a customer's wallet. Two patterns, both layered on the existing
`src/lib/payments/` module:

- **Recurring invoices:** the gateway issues a new invoice each period; the customer must actively
  pay. Higher involuntary churn.
- **Prepaid balance / custody credit (recommended):** the customer tops up a balance; a scheduled
  worker **auto-deducts** the monthly fee and warns + suspends on low balance. This behaves closest to
  a subscription and best fits the seedbox lifecycle. It is a thin extension of our current
  `PaymentRequest`/`PaymentSession` flow.

Requirements:
- Price plans in **fiat (USD)** (as `SUBSCRIPTION_PRICES` already does), settle in crypto, and **auto-
  convert to a stablecoin** to avoid volatility eating margin. `formatCryptoAmount` already special-
  cases USDT/USDC.
- Confirm payment **on-chain** before provisioning; reuse the existing webhook verification
  (`verifyWebhookSignature`, `sha256=` HMAC) and `processWebhookPayload`. Handle under/over-payment and
  slow confirmations gracefully.
- **Refunds are manual** (no chargebacks). Define a refund window/policy explicitly; abuse-terminated
  accounts are non-refundable.
- Confirm CoinPayPortal supports the recurring/prepaid model we need, or implement the schedule on our
  side (a `seedbox-billing` worker) against one-off CoinPayPortal sessions. **(Open question §11.)**
- **KYC/AML still applies to us as the merchant** at the crypto on/off-ramp. Crypto removes card-
  processor screening, not our regulatory obligations.

---

## 6. Legal & Compliance (M0 — treat as launch-blocking)

This product is torrent-adjacent. Seedboxes are **legal**, but providers have been investigated when
downstream users shared infringing content, so the compliance layer is not optional.

- **Upstream ToS / reselling clauses (M0):** Most consumer seedbox hosts forbid reselling and "slot
  re-sharing." Resell only under a written reseller agreement (B2) or via VPS providers whose AUP
  permits the usage (B1). Verify each provider's torrent stance before onboarding it — including
  DigitalOcean's.
- **Acceptable Use Policy (M0):** Publish an AUP. Prohibit what gets *us* shut down upstream:
  malware/DDoS, disallowed public-tracker abuse, and — non-negotiable — any CSAM. Reserve immediate
  termination.
- **DMCA / safe harbor (M0):** Register a designated agent, publish a notice-handling process, and
  maintain a **repeat-infringer policy**. Choose jurisdiction deliberately; US-hosted capacity raises
  enforcement exposure.
- **KYC/AML (M0):** Required at the crypto ramp regardless of the space's "anonymous" reputation.
- **Data handling (M0):** Our keys and BYOS connection metadata are sensitive. Define retention,
  encryption, and breach response up front. Keep secrets out of Supabase (references only).
- **Clear marketing (M1):** Do not advertise as a piracy tool. That framing turns a legal hosting tool
  into evidence of intent.

---

## 7. Architecture (high level)

Built into the BitTorrented monorepo, following existing conventions.

```
┌──────────────────────────────────────────────────────────────────────┐
│  BitTorrented (Next.js 16 App Router, DigitalOcean Droplet)            │
│                                                                        │
│  src/app/                                                              │
│    seedbox/                     # dashboard UI (server-rendered)       │
│    api/seedbox/                 # orders, plans, lifecycle actions     │
│    api/byos/                    # connection issuance + revocation     │
│    api/payments/coinpayportal/  # existing webhook (reused)            │
│                                                                        │
│  src/lib/                                                              │
│    payments/                    # CoinPayPortal (exists) + prepaid     │
│    seedbox/                     # entitlements, lifecycle state machine │
│      index.ts, repository.ts, lifecycle.ts, *.test.ts                  │
│    provisioning/                # ProvisioningProvider abstraction      │
│      index.ts, digitalocean.ts, reseller.ts, *.test.ts                 │
│    byos/                        # keypair issuance, command broker      │
│    audit/                       # immutable event log writer            │
│                                                                        │
│  workers/                                                              │
│    seedbox-provisioner/         # consumes provision/teardown jobs      │
│    seedbox-billing/             # prepaid deduction + dunning (cron)    │
│    byos-connector/              # least-privilege SSH command runner    │
│                                 # (+ Dockerfile.<name>-worker each)     │
│                                                                        │
│  supabase/                      # migrations for tables below           │
└──────────────────────────────────────────────────────────────────────┘
              │ DO API / reseller API          │ SSH (our key)
              ▼                                 ▼
    Upstream VPS / reseller slots        Customer-owned servers (BYOS)
```

- **Control plane / API:** Next.js API routes for orders, entitlements, lifecycle transitions, audit
  log — server-side only (our standing rule; no client-side Supabase access).
- **Provider abstraction:** `ProvisioningProvider` with a common interface (`create`, `suspend`,
  `terminate`, `status`, `rotateCredentials`); `digitalocean.ts` first, `reseller.ts` later.
- **Provisioning workers:** call providers; run `cloud-init`/install scripts (reuse
  `scripts/setup-droplet.sh` as the stack-install baseline).
- **BYOS connector service:** per-connection keypair issuance, agent channel (M3), SSH-CA signer (M4);
  strictly least-privilege command execution.
- **Secrets:** KMS/Vault, envelope encryption, per-tenant keys. Supabase stores **references**, not
  secrets.
- **Billing integration:** CoinPayPortal webhook → on-chain confirmation → entitlement activation;
  `seedbox-billing` worker for balance deduction + dunning.
- **Audit & abuse:** immutable event log for every privileged action and lifecycle transition;
  abuse-report intake wired to suspend/terminate.

### 7.1 Data model (Supabase Postgres)

Server-side access only, matching `src/lib/payments/repository.ts`. New tables (migrations in
`supabase/`):

```sql
-- A purchased managed seedbox or a connected BYOS server
create table seedbox_resources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  kind          text not null check (kind in ('managed','byos')),
  provider      text,                       -- 'digitalocean' | 'reseller' | null for byos
  provider_ref  text,                       -- e.g. DO droplet id; null for byos
  plan          text,                       -- managed plan tier
  status        text not null default 'pending'
                  check (status in ('pending','provisioning','active',
                                    'suspended','terminating','terminated','failed')),
  host          text,                        -- ip / hostname when known
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  terminated_at timestamptz,
  metadata      jsonb not null default '{}'  -- specs, region, etc. (no secrets)
);

-- Prepaid balance + auto-deduction schedule (extends CoinPayPortal flow)
create table seedbox_billing_accounts (
  user_id          uuid primary key references auth.users(id),
  balance_usd      numeric(12,2) not null default 0,
  monthly_fee_usd  numeric(12,2) not null,
  next_charge_at   timestamptz,
  low_balance_warned_at timestamptz,
  updated_at       timestamptz not null default now()
);

-- Per-connection BYOS key references (NEVER the customer's private key)
create table byos_connections (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references seedbox_resources(id) on delete cascade,
  public_key    text not null,              -- our public key shown to the user
  secret_ref    text not null,              -- KMS/Vault reference to OUR private key
  ssh_user      text not null default 'seedbox-mgr',
  status        text not null default 'pending'
                  check (status in ('pending','connected','revoked','error')),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Immutable audit log for every privileged action / lifecycle transition
create table seedbox_audit_events (
  id           bigserial primary key,
  user_id      uuid references auth.users(id),
  resource_id  uuid references seedbox_resources(id),
  action       text not null,               -- 'provision','suspend','terminate','byos.connect',...
  actor        text not null,               -- 'system' | 'operator:<id>' | 'user'
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index on seedbox_audit_events (resource_id, created_at);
```

---

## 8. Success Metrics

**Leading (days–weeks):**
- Purchase → active conversion rate; median time-to-provision (target < 10 min).
- BYOS connection success rate via Tier-1 (target: majority complete without support).
- % of payments auto-confirmed without manual intervention.

**Lagging (weeks–months):**
- Net margin per managed seat after fees + support + abuse reserve (target positive and stable).
- Involuntary churn rate (prepaid-balance model should keep this low).
- Support tickets per active seat.
- Abuse/DMCA notices per 100 seats and mean time to action.

---

## 9. Open Questions

- **[Legal]** Which jurisdiction for the entity and for B1 capacity? Drives DMCA exposure and provider
  choice.
- **[Eng/Infra]** Is DigitalOcean's AUP permissive enough for end-user BitTorrent traffic, or do we
  need Hetzner/Vultr as the primary B1 provider from day one?
- **[Legal/Bizdev]** Can we secure a written reseller agreement (B2), and do the volume minimums pencil
  out at our forecast?
- **[Finance/Eng]** Does CoinPayPortal support recurring/prepaid deduction natively, or do we drive the
  schedule ourselves with a `seedbox-billing` worker against one-off sessions? Confirm fee structure and
  stablecoin auto-convert.
- **[Product]** Does BYOS justify a flat management fee, or is it a funnel/loss-leader into managed
  plans?
- **[Eng/Security]** Open-source agent (Tier 1+) in M3 or M4? Strongest trust story, but real
  maintenance surface.

---

## 10. Milestones

Following the repo's TDD convention (tests first, then implementation; Vitest unit + Playwright e2e).

**M0 — Legal foundation + billing extension (launch-blocking)**
- AUP + DMCA designated agent + repeat-infringer policy + KYC at the crypto ramp. **Live before the
  first paid customer.**
- Extend `src/lib/payments/` with prepaid-balance accounting and the `seedbox-billing` worker (deduct +
  dunning). TDD against the existing payments test suite.

**M1 — Managed MVP (validate demand + crypto flow)**
- One B1 provider (DigitalOcean) behind `ProvisioningProvider`; automated seedbox stack install via
  `cloud-init` / `setup-droplet.sh` baseline.
- `seedbox-provisioner` worker; full lifecycle (provision/suspend/terminate + secure wipe) with audit
  log and credential-delivery email.
- Buyer dashboard at `src/app/seedbox/` (server-rendered) with balance/expiry + top-up.

**M2 — BYOS Tier 1**
- Per-connection keypair issuance; one-line `authorized_keys` onboarding; self-serve revocation.
- `byos-connector` worker for least-privilege command execution; secrets in KMS/Vault (references in
  Supabase).
- Clear in-product disclosure of exactly which commands we run.

**M3 — Supply diversification + agent**
- Second provisioning backend (second VPS provider, or B2 reseller under signed agreement).
- Open-source outbound **agent** (BYOS Tier 1+).

**M4 — Hardening & scale**
- SSH-CA short-lived certificates (BYOS Tier 3).
- Team/multi-seat accounts; richer operator dashboards.

---

## Appendix A — Provider shortlist (verify current terms before integrating)

| Provider | Role | Programmatic purchase | Must verify |
|---|---|---|---|
| DigitalOcean (VPS) | **B1** backend (primary; already in use) | Mature cloud API; we already deploy here | BitTorrent stance in AUP; abuse-handling SLA for end-user torrenting |
| Hetzner / Vultr / OVH (VPS) | **B1** backend (fallback if DO is restrictive) | Mature cloud APIs | BitTorrent stance in AUP; abuse-handling SLA |
| Pulsed Media | **B2** reseller | Tiered reseller program | Volume minimums; reseller-agreement terms |
| Other seedbox hosts advertising "reseller"/"API" | **B2** | Varies; some pages are thin/placeholder | That the API actually exists and a contract permits resale |
| CoinPayPortal | Crypto billing (already integrated) | API + webhooks (in `src/lib/payments/`) | Recurring/prepaid support; fees; stablecoin auto-convert |

_All provider capabilities, pricing, and ToS change frequently — confirm directly with each vendor
before building against them._
