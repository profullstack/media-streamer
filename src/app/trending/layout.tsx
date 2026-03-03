import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trending — BitTorrented',
  description: 'Browse Trending on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
