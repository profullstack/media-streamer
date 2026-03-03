import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Browse Search on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
