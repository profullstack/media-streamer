# Product Requirements Document
## Email Accounts And SMTP Configuration

**Version:** 1.0
**Date:** June 6, 2026
**Status:** Draft

## 1. Overview

Add user-managed email account configuration so BitTorrented can store and validate multiple outbound SMTP accounts per authenticated user. The initial scope is SMTP configuration only: verifying connectivity and authentication, choosing defaults, and making the configuration available for future notification or sending workflows.

SMTP does not read inboxes. Checking incoming mail for multiple accounts requires IMAP or POP3 and is explicitly a later milestone.

### Goals
- Let an authenticated user configure multiple SMTP accounts.
- Validate host, port, TLS mode, username, password, and from address.
- Mark one account as the default sender.
- Run per-account SMTP health checks without sending a user-visible message.
- Store account status and last check results.

### Non-Goals
- No inbox reading in M1.
- No IMAP/POP3 settings in M1.
- No full webmail client in M1.
- No campaign, bulk mail, or marketing automation tools.

## 2. Users And Use Cases

- A user connects several outbound email identities.
- A user checks whether each SMTP account can authenticate.
- The app later sends notifications through the user's selected account.
- Admin/debug workflows can inspect sanitized status without exposing secrets.

## 3. Functional Requirements

### Account Management
- Create, list, update, delete SMTP accounts for the authenticated user.
- Required fields: label, from_email, host, port, security mode, username, password.
- Optional fields: from_name, reply_to_email, provider, is_default.
- Support multiple accounts per user.
- Enforce a single default account per user.

### SMTP Check
- Connect to the SMTP server using `none`, `starttls`, or `tls` security.
- Send `EHLO`, optionally upgrade via `STARTTLS`, authenticate when credentials are present, then quit.
- Store `last_checked_at`, `last_check_status`, and `last_check_error`.
- Never return passwords or raw credentials in API responses.

### API
- `GET /api/email/accounts` lists SMTP accounts for the current user.
- `POST /api/email/accounts` creates an account.
- `PATCH /api/email/accounts/[id]` updates non-secret fields or rotates the password.
- `DELETE /api/email/accounts/[id]` deletes an account.
- `POST /api/email/accounts/[id]/check` runs a health check.

## 4. Security Requirements

- Store credentials server-side only.
- Do not expose passwords through API responses.
- Add a migration comment noting encryption-at-rest is required before production handling of real credentials.
- RLS must restrict rows to `auth.uid() = user_id`.
- Service-role API code must still filter by authenticated `user_id`.
- Log sanitized errors only.

## 5. Data Model

- `email_accounts`: SMTP account configuration and health status.
- One partial unique index for the default account per user.
- Index by `user_id` and `last_check_status`.

## 6. Technical Design

- Keep outbound app email sending via the existing `src/lib/email/email.ts` Resend service.
- Add SMTP account management in `src/lib/email-accounts` to avoid mixing user SMTP accounts with Resend transactional templates.
- Implement SMTP health checks using Node `net`/`tls` primitives so M1 avoids adding a mailer dependency.

## 7. Milestones

### M1 Backend Contract
- PRD, migration, repository/service, API routes, SMTP config validation, unit tests.

### M2 Settings UI
- Add a settings tab for account list, create/edit dialog, default selection, and check status.

### M3 Send Integration
- Send selected notification classes through the user's default SMTP account.

### M4 Inbox Support
- Add IMAP/POP3 configuration and mailbox polling if the product needs actual email checking.

## 8. Success Metrics

- A user can store multiple SMTP accounts and set exactly one default.
- Health checks update per-account status without exposing credentials.
- Invalid SMTP configurations fail validation before persistence when possible.
- Existing Resend transactional email tests continue to pass.
