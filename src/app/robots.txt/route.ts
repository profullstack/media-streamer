/**
 * robots.txt, generated from the crawl gateway's lists so the file and the
 * gate agree: training crawlers are refused everywhere but /crawl (where they
 * can pay), retrieval crawlers are named as welcome, everyone else gets the
 * wildcard rules.
 */

import { robotsRoute } from '@profullstack/x402-gateway/next';
import { gateway } from '@/lib/crawl-gateway';

export const GET = robotsRoute(gateway, {
  disallow: ['/api/', '/login', '/settings', '/dashboard/'],
});
