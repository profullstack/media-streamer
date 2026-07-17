import type { NextRequest } from "next/server";
import { createReferralsRouteHandler } from "@profullstack/stack/referrals";
import { referralStore } from "@/lib/referrals";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = createReferralsRouteHandler({
  store: referralStore,
  getUserId: async (req) => (await getAuthenticatedUser(req as NextRequest))?.id ?? null,
});
