import { inviteMetadata } from '@/lib/invite-metadata';

export const metadata = inviteMetadata('Invite only');

/**
 * While the site is invite only, `/` answers 307 here, so this screen is the homepage
 * the Profullstack ring's verifier sees. The page wraps itself in MainLayout, which
 * carries the site nav and the site footer; the root layout adds the pit.world network footer.
 */
export default function InviteOnlyLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
