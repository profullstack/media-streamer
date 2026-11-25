/**
 * Who may host a watch party.
 *
 * Joining is open to every member; starting one is part of a plan (trial, Premium or
 * Family: the same test the paid routes use in src/lib/legal-mode.ts). It is checked
 * here and not by path in the proxy, because the page and the join route have to stay
 * open for the people a host invites.
 */

import { checkUserAdmin } from '@/lib/admin';
import { isSubscriptionActive } from '@/lib/subscription/check';
import { LEGAL_MODE } from '@/lib/legal-mode';

export async function canHostParty(userId: string): Promise<boolean> {
  if (!LEGAL_MODE) return true;
  try {
    if ((await isSubscriptionActive(userId)).active) return true;
    return (await checkUserAdmin(userId)).isAdmin;
  } catch {
    return false;
  }
}
