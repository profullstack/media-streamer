import { createReferralsClient } from "@profullstack/stack/referrals";
import { getServerClient } from "@/lib/supabase";

export const referralStore = createReferralsClient({
  getClient: () => getServerClient(),
});
