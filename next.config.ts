import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  
  // Enable standalone output for Docker deployment
  output: 'standalone',
  
  // Enable experimental features for better performance
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {
    // Turbopack-specific configuration can go here
  },

  // Exclude WebTorrent and its dependencies from server bundling
  // These packages use native Node.js modules that need to run in Node.js runtime
  serverExternalPackages: [
    'webtorrent',
    'node-datachannel',
    'webrtc-polyfill',
    '@thaunknown/simple-peer',
  ],

  // Headers for security and PWA
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
