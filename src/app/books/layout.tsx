import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Books — BitTorrented',
  description: 'Browse Books on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
