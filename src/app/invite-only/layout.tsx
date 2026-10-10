import { inviteMetadata } from '@/lib/invite-metadata';
import { Webring } from '@/components/layout/webring';

export const metadata = inviteMetadata('Invite only');

/**
 * While the site is invite only, `/` answers 307 here, so this screen is the homepage
 * the Profullstack ring's verifier sees: it carries the ring links, server-rendered.
 */
export default function InviteOnlyLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <>
      {children}
      <footer className="bg-bg-primary px-4 pb-6 text-center text-sm text-text-secondary">
        <Webring className="webring" />
      </footer>
    </>
  );
}
