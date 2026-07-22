import { VodStorefront } from './vod-client';

export const dynamic = 'force-dynamic';

/**
 * Public VOD storefront. No auth required: browse a provider's catalog, buy a
 * $1 weekly pass or a single title ($1, stream or download), then watch.
 * See docs/prds/vod-monetization.md.
 */
export default async function VodPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <VodStorefront slug={slug} />;
}
