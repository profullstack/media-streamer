import { inviteMetadata } from '@/lib/invite-metadata';

export const metadata = inviteMetadata("You're invited");

export default function SignupLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
