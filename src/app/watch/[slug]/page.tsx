import { WatchClient } from './watch-client';

export const dynamic = 'force-dynamic';

/**
 * Public IPTV resale page. No account required: a visitor buys a time-boxed pass,
 * picks a channel, and watches through our proxy. The owner's provider credentials
 * never reach the browser — see docs/prds/iptv-pay-per-game.md.
 */
export default async function WatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <WatchClient slug={slug} />;
}
