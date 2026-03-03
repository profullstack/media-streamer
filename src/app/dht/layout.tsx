import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DHT Torrents',
  description: 'Browse DHT Torrents on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
