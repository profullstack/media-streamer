import Link from 'next/link';
import { loadAllPosts } from '@/lib/blog/posts';

export const metadata = {
  title: 'Blog | BitTorrented',
  description: 'Streaming, torrents, IPTV, and media tech — from the BitTorrented team.',
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': '/blog/rss.xml' },
  },
};

export const revalidate = 60;

export default async function BlogPage() {
  const posts = await loadAllPosts();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Blog</h1>
      <p className="mt-2 text-muted-foreground">
        Streaming, torrents, IPTV, and media tech.
      </p>

      {posts.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No posts yet.</p>
      ) : (
        <ul className="mt-10 space-y-6">
          {posts.map((p) => (
            <li key={p.slug} className="rounded-lg border border-border bg-card overflow-hidden">
              <Link href={`/blog/${p.slug}`} className="flex gap-4 p-4 sm:gap-5 sm:p-5 hover:bg-accent/10 transition-colors">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    loading="lazy"
                    width={120}
                    height={120}
                    className="h-20 w-20 shrink-0 rounded-md object-cover sm:h-28 sm:w-28"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase tracking-wider text-muted-foreground sm:h-28 sm:w-28"
                  >
                    BT
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold leading-snug sm:text-xl">{p.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{p.date}</p>
                  {p.excerpt ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
