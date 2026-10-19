import type { Metadata } from 'next';
import { AD_NETWORK_CODE } from '@/lib/ad-network';
import { inviteMetadata } from '@/lib/invite-metadata';

export const metadata: Metadata = {
  ...inviteMetadata('Invite only'),
  // ad.network site verification: it reads the raw HTML of the homepage for this code.
  other: { 'ad.network': AD_NETWORK_CODE },
};

/**
 * While the site is invite only, `/` answers 307 here, so this screen is the homepage
 * the Profullstack ring's verifier sees. The page wraps itself in MainLayout, which
 * carries the site nav and the site footer (with its ring links), server-rendered.
 */
export default function InviteOnlyLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
