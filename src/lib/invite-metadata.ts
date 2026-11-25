import type { Metadata } from 'next';

/**
 * Link-preview copy for the pages an invite link opens (/signup, /invite-only), so a
 * pasted invite says what BitTorrented is (src/components/home/invite-landing.tsx).
 */
const DESCRIPTION =
  'One membership for your own media tools: Live TV from your own playlist, your own seedbox streamed in the browser, one-click live streaming, watch parties, news and feeds. From $4.99 a year, 3 days free. Invite only.';

const BANNER = 'https://bittorrented.com/banner.png';

export function inviteMetadata(title: string): Metadata {
  return {
    title,
    description: DESCRIPTION,
    // A child openGraph/twitter replaces the root layout's whole object, so repeat the image.
    openGraph: {
      type: 'website',
      siteName: 'BitTorrented',
      title: `${title} | BitTorrented`,
      description: DESCRIPTION,
      images: [{ url: BANNER, alt: 'BitTorrented' }],
    },
    twitter: { card: 'summary_large_image', title: `${title} | BitTorrented`, description: DESCRIPTION, images: [BANNER] },
  };
}
