import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { TvLayoutProvider } from '@/components/layout';
import { Providers } from '@/components/providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'BitTorrented',
    template: '%s | BitTorrented',
  },
  description: 'Stream music, movies, books, and live TV from torrents and IPTV',
  keywords: ['torrent', 'streaming', 'music', 'movies', 'ebooks', 'iptv', 'live tv', 'bittorrent'],
  authors: [{ name: 'BitTorrented' }],
  creator: 'BitTorrented',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BitTorrented',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'BitTorrented',
    title: 'BitTorrented',
    description: 'Stream music, movies, books, and live TV from torrents and IPTV',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BitTorrented',
    description: 'Stream music, movies, books, and live TV from torrents and IPTV',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { url: '/icons/apple-touch-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/icons/apple-touch-icon-114x114.png', sizes: '114x114', type: 'image/png' },
      { url: '/icons/apple-touch-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/icons/apple-touch-icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/icons/apple-touch-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/icons/apple-touch-icon-57x57.png', sizes: '57x57', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        {/* PWA meta tags */}
        <meta name="application-name" content="BitTorrented" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="BitTorrented" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Windows meta tags */}
        <meta name="msapplication-TileColor" content="#8b5cf6" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileImage" content="/icons/apple-touch-icon-144x144.png" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Preconnect to external resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preconnect to analytics */}
        <link rel="preconnect" href="https://datafa.st" />
      </head>
      <body className="min-h-screen bg-bg-primary font-sans antialiased">
        <Providers>
          <TvLayoutProvider>
            {children}
          </TvLayoutProvider>
        </Providers>
        
        {/* Datafast Analytics */}
        <Script
          defer
          data-website-id="dfid_tUS5tnJRx0ruOfjt5GwLm"
          data-domain="bittorrented.com"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
