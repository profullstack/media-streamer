import Link from 'next/link';
import { loadAllPosts } from '@/lib/blog/posts';

export async function BlogPreviewSection() {
  const posts = await loadAllPosts();
  const recent = posts.slice(0, 2);

  if (recent.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">From the Blog</h2>
        <Link href="/blog" className="text-sm text-primary hover:underline">
          View all →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {recent.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/10"
          >
            {post.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image_url}
                alt=""
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                BT
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{post.date}</p>
              <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                {post.title}
              </h3>
              {post.excerpt ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
