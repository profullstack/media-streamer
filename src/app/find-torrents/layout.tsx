import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find Torrents',
  description: 'Browse Find Torrents on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
