/**
 * Profullstack OpenWebring footer links (rssamplifier.com/ring/profullstack).
 *
 * A server component on purpose: the ring's verifier reads these links from the
 * server-rendered HTML of the homepage. While the site is invite only, `/` answers
 * 307 to /invite-only (src/lib/site-offline.ts), so that screen carries them too.
 */

const RING = 'https://rssamplifier.com/ring/profullstack';
const FROM = encodeURIComponent('https://bittorrented.com/');
const link = 'hover:text-text-primary transition-colors';

export function Webring({ className = 'webring mt-2' }: { className?: string }): React.ReactNode {
  return (
    <nav className={className} aria-label="Profullstack webring">
      <a href={`${RING}/previous?from=${FROM}`} rel="prev" title="Previous site" className={link}>
        {"<<"}
      </a>
      <span className="mx-2">·</span>
      <a href={RING} className={link}>
        Profullstack
      </a>
      <span className="mx-2">·</span>
      <a href={`${RING}/next?from=${FROM}`} rel="next" title="Next site" className={link}>
        {">>"}
      </a>
      <span className="mx-2">·</span>
      <a href={`${RING}/random?from=${FROM}`} title="Random site" aria-label="Random site" className={link}>
        {"⚄"}
      </a>
    </nav>
  );
}
