import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Movies — BitTorrented',
  description: 'Browse Movies on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
