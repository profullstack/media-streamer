"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { findAuthUserByEmail, requireAdminUser } from "@/lib/admin";
import { getServerClient } from "@/lib/supabase";

type Ok<T = undefined> = { ok: true } & (T extends undefined ? object : T);
type Err = { ok: false; error: string };

const TIERS = ["premium", "family"] as const;
type PaidTier = (typeof TIERS)[number];

function isPaidTier(value: string): value is PaidTier {
  return (TIERS as readonly string[]).includes(value);
}

async function assertAdmin(): Promise<Ok<{ adminId: string }> | Err> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  if (!(await requireAdminUser(user.id))) return { ok: false, error: "Admin only." };
  return { ok: true, adminId: user.id };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function upgradeUserByEmail(input: {
  email: string;
  tier: string;
  months: number;
}): Promise<Ok<{ email: string; tier: PaidTier; expiresAt: string }> | Err> {
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) return adminCheck;

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Valid email is required." };
  if (!isPaidTier(input.tier)) return { ok: false, error: "Choose premium or family." };

  const months = Math.max(1, Math.min(60, Math.trunc(Number(input.months) || 12)));
  const svc = getServerClient() as any;
  const target = await findAuthUserByEmail(email, svc);
  if (!target) return { ok: false, error: "No account found for that email." };

  const { data: existing, error: existingError } = await svc
    .from("user_subscriptions")
    .select("subscription_started_at, subscription_expires_at, tier, status")
    .eq("user_id", target.id)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  const now = new Date();
  const currentExpiry = existing?.subscription_expires_at ? new Date(existing.subscription_expires_at) : null;
  const start =
    existing?.status === "active" &&
    (existing?.tier === "premium" || existing?.tier === "family") &&
    currentExpiry &&
    currentExpiry > now
      ? currentExpiry
      : now;
  const expiresAt = addMonths(start, months).toISOString();

  const { error } = await svc
    .from("user_subscriptions")
    .upsert(
      {
        user_id: target.id,
        tier: input.tier,
        status: "active",
        subscription_started_at: existing?.subscription_started_at ?? now.toISOString(),
        subscription_expires_at: expiresAt,
        renewal_reminder_sent_at: null,
        renewal_reminder_7d_sent: false,
        renewal_reminder_3d_sent: false,
        renewal_reminder_1d_sent: false,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, email: target.email, tier: input.tier, expiresAt };
}
