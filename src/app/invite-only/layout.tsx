import { inviteMetadata } from '@/lib/invite-metadata';

export const metadata = inviteMetadata('Invite only');

export default function InviteOnlyLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
