import { inviteMetadata } from '@/lib/invite-metadata';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata = inviteMetadata('Invite only');

/**
 * While the site is invite only, `/` answers 307 here, so this screen is the homepage
 * the Profullstack ring's verifier sees: it carries the site footer and its ring links, server-rendered.
 */
export default function InviteOnlyLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <>
      {children}
      <div className="bg-bg-primary text-text-secondary">
        <SiteFooter />
      </div>
    </>
  );
}
