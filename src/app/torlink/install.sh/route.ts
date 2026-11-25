/**
 * GET /torlink/install.sh
 *
 * The torlink installer a member (or `c0mpute plugin install torlink`) runs on their
 * own machine. Public and secret-free: it holds no token and nothing about anybody's
 * account (src/lib/seedbox/local-install.ts).
 */

import { buildLocalInstallScript } from '@/lib/seedbox/local-install';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildLocalInstallScript(), {
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
