import type { ReferralCode, ReferralStore, ReferralUsage } from "@profullstack/referrals";
import { getServerClient } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const referralStore: ReferralStore = {
  async saveCode(code: ReferralCode) {
    const { error } = await (getServerClient() as AnyClient).from("referral_codes").insert({
      code: code.code, owner_id: code.ownerId,
      created_at: code.createdAt.toISOString(),
      expires_at: code.expiresAt?.toISOString() ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async getCode(code: string): Promise<ReferralCode | null> {
    const { data } = await (getServerClient() as AnyClient).from("referral_codes").select("*").eq("code", code).maybeSingle();
    if (!data) return null;
    return { code: data.code, ownerId: data.owner_id, createdAt: new Date(data.created_at), expiresAt: data.expires_at ? new Date(data.expires_at) : null };
  },

  async saveUsage(usage: ReferralUsage) {
    const { error } = await (getServerClient() as AnyClient).from("referral_usages").insert({
      code: usage.code, affiliate_id: usage.affiliateId, new_user_id: usage.newUserId,
      amount_cents: usage.amountCents, commission_cents: usage.commissionCents,
      discount_cents: usage.discountCents, applied_at: usage.appliedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  },

  async getUsagesByAffiliate(affiliateId: string): Promise<ReferralUsage[]> {
    const { data } = await (getServerClient() as AnyClient).from("referral_usages").select("*").eq("affiliate_id", affiliateId).order("applied_at", { ascending: false });
    return (data ?? []).map((row: any) => ({ code: row.code, affiliateId: row.affiliate_id, newUserId: row.new_user_id, amountCents: row.amount_cents, commissionCents: row.commission_cents, discountCents: row.discount_cents, appliedAt: new Date(row.applied_at) }));
  },
};
