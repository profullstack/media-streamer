/**
 * Crawl gateway: sells a day of crawl access to AI training crawlers over x402.
 *
 * Training crawlers (GPTBot, ClaudeBot, CCBot, meta-externalagent, Bytespider,
 * Applebot-Extended, ...) get `402 Payment Required` with an x402 offer, or the
 * HTML sales page at /crawl. A paid pass in the `x-crawl-pass` header lets them
 * through. People, Googlebot and retrieval crawlers are untouched.
 *
 * Used by src/proxy.ts (the gate) and src/app/robots.txt/route.ts (the lists),
 * so robots.txt and the gate never disagree about who is who.
 *
 * Imports nothing Node-only: the proxy may run at the edge.
 */

import { createGateway } from '@profullstack/x402-gateway';

export const gateway = createGateway({
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://bittorrented.com',
  siteName: 'bittorrented',
  coinpay: { apiKey: process.env.COINPAY_X402_KEY },
  payTo: process.env.CRAWL_PAY_TO,
});
