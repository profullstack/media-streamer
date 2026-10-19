/**
 * The site footer: one row of links and the copyright. Network links (search,
 * ring, publish) come from the pit.world footer (pit-footer.tsx) that the root
 * layout renders as the last thing in <body>.
 *
 * MainLayout is a client component, so the root layout renders this once and
 * hands it down through SiteFooterProvider.
 */
const LINKS = [
  { label: 'Contact', href: 'mailto:support@bittorrented.com?subject=BitTorrented' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'GitHub', href: 'https://github.com/profullstack/media-streamer' },
];

export function SiteFooter(): React.ReactNode {
  return (
    <footer className="border-t border-white/10 text-sm">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5"
      >
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="hover:text-text-primary hover:underline">
            {link.label}
          </a>
        ))}
        <span>
          &copy; {new Date().getFullYear()}{' '}
          <a href="https://profullstack.com/" className="hover:text-text-primary hover:underline">
            Profullstack, Inc.
          </a>
        </span>
      </nav>
    </footer>
  );
}
