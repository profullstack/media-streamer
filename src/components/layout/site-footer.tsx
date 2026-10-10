import { Footer } from '@profullstack/footer/react';

/**
 * The site footer: @profullstack/footer (links, copyright and the Profullstack
 * webring). An async server component: it renders on the server, where the ring's
 * verifier reads it, and fetches the package's @latest template so a footer release
 * reaches the site without a redeploy.
 *
 * MainLayout is a client component, so it cannot render this itself: the root
 * layout renders it once and hands it down through SiteFooterProvider.
 */
export function SiteFooter(): React.ReactNode {
  return (
    <Footer
      site="https://bittorrented.com/"
      links={[
        { label: 'Contact Us', href: 'mailto:support@bittorrented.com?subject=BitTorrented' },
        { label: 'Terms', href: '/terms' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'GitHub', href: 'https://github.com/profullstack/media-streamer' },
      ]}
    />
  );
}
