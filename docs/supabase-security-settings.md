# Supabase Security Settings

This document describes security settings that must be configured in the Supabase Dashboard.

## Leaked Password Protection

**Status:** Must be enabled manually in Supabase Dashboard

### What is it?

Supabase Auth can prevent users from using compromised passwords by checking against the [HaveIBeenPwned.org](https://haveibeenpwned.com/) database. This database contains billions of passwords that have been exposed in data breaches.

### Why enable it?

- Prevents users from using passwords that are known to be compromised
- Reduces the risk of credential stuffing attacks
- Enhances overall account security
- Industry best practice for authentication systems

### How to enable

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers** → **Email**
4. Scroll down to **Password Security**
5. Enable **"Leaked Password Protection"**
6. Click **Save**

### Reference

- [Supabase Password Security Documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

---

## Function Search Path Security

**Status:** Fixed via migration `20260104090000_fix_function_search_paths.sql`

### What was the issue?

PostgreSQL functions that don't have an explicit `search_path` set can be vulnerable to search path manipulation attacks. An attacker could potentially create malicious objects in a schema that appears earlier in the search path, causing the function to execute unintended code.

### How it was fixed

All 13 affected functions now have `SET search_path = ''` appended to their definitions:

**Family Plan Functions:**
- `create_family_plan_for_user`
- `get_family_member_count`
- `can_invite_family_member`
- `get_user_family_plan`
- `get_family_members`
- `get_family_invitations`
- `accept_family_invitation`
- `remove_family_member`
- `revoke_family_invitation`
- `expire_old_family_invitations`
- `get_family_owner_id`

**IPTV Subscription Functions:**
- `update_iptv_subscriptions_updated_at`
- `get_active_iptv_subscription`

### Reference

- [Supabase Database Linter - Function Search Path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

---

## Applying the Migration

To apply the search path fix migration:

```bash
# Using Supabase CLI
supabase db push

# Or apply directly to remote database
supabase db push --linked
```

## Verifying the Fixes

After applying the migration and enabling leaked password protection, run the Supabase Advisor again to verify all warnings are resolved:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Database** → **Advisor**
4. Click **Run Advisor**
5. Verify no security warnings remain
