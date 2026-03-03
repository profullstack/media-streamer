import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Music — BitTorrented',
  description: 'Browse Music on BitTorrented',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
