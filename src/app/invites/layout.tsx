import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Invites', robots: { index: false } };

export default function InvitesLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}
