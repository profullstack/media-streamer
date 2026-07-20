import { RentClient } from './rent-client';

export const dynamic = 'force-dynamic';

/**
 * Public seedbox-rental page. No auth required: a visitor pays $0.25 for a
 * session pass, adds their own magnet, the owner's seedbox downloads it, and
 * they stream it here. See docs/prds/seedbox-pay-per-watch.md.
 */
export default async function RentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <RentClient slug={slug} />;
}
