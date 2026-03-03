import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TV Shows — BitTorrented',
  description: 'Browse TV Shows on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
