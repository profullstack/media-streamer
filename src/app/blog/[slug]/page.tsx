import { notFound } from 'next/navigation';
import Link from 'next/link';
import { findPost } from '@/lib/blog/posts';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await findPost(slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: `${post.title} | BitTorrented`,
    description: post.excerpt || undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      url: `/blog/${slug}`,
      title: post.title,
      description: post.excerpt || undefined,
      images: post.image_url ? [{ url: post.image_url }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await findPost(slug);
  if (!post) notFound();

  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://bittorrented.com').replace(/\/$/, '');

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to blog
      </Link>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            datePublished: post.date,
            author: { '@type': 'Organization', name: 'BitTorrented' },
            mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
            image: post.image_url ? [post.image_url] : undefined,
          }),
        }}
      />
      <p className="mt-4 text-sm text-muted-foreground">{post.date}</p>
      <h1 className="mt-2 text-4xl font-bold">{post.title}</h1>
      {post.image_url ? <img
          src={post.image_url}
          alt=""
          className="mt-6 w-full rounded-lg border border-border"
        /> : null}
      {post.html ? (
        <article
          className="blog-prose"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      ) : (
        <article className="blog-prose">{post.excerpt}</article>
      )}

      <style>{`
        .blog-prose {
          margin-top: 2rem;
          line-height: 1.8;
          color: var(--color-text-primary, #e2e8f0);
        }
        .blog-prose p { margin: 1.25rem 0; }
        .blog-prose h1, .blog-prose h2, .blog-prose h3, .blog-prose h4 {
          font-weight: 700;
          line-height: 1.3;
          margin: 2rem 0 0.75rem;
          color: var(--color-text-primary, #f1f5f9);
        }
        .blog-prose h1 { font-size: 1.875rem; }
        .blog-prose h2 { font-size: 1.5rem; border-bottom: 1px solid var(--color-border, #334155); padding-bottom: 0.4rem; }
        .blog-prose h3 { font-size: 1.25rem; }
        .blog-prose h4 { font-size: 1.1rem; }
        .blog-prose ul, .blog-prose ol { padding-left: 1.75rem; margin: 1.25rem 0; }
        .blog-prose ul { list-style: disc; }
        .blog-prose ol { list-style: decimal; }
        .blog-prose li { margin: 0.4rem 0; }
        .blog-prose li > ul, .blog-prose li > ol { margin: 0.25rem 0; }
        .blog-prose blockquote {
          border-left: 3px solid var(--color-accent, #8b5cf6);
          padding: 0.5rem 0 0.5rem 1.25rem;
          margin: 1.5rem 0;
          color: var(--color-text-secondary, #94a3b8);
          font-style: italic;
        }
        .blog-prose code {
          background: var(--color-bg-secondary, #1e293b);
          border: 1px solid var(--color-border, #334155);
          border-radius: 0.25rem;
          padding: 0.15rem 0.4rem;
          font-size: 0.875em;
          font-family: ui-monospace, monospace;
          color: #a78bfa;
        }
        .blog-prose pre {
          background: var(--color-bg-secondary, #1e293b);
          border: 1px solid var(--color-border, #334155);
          border-radius: 0.5rem;
          padding: 1.25rem;
          overflow-x: auto;
          margin: 1.5rem 0;
        }
        .blog-prose pre code {
          background: none;
          border: none;
          padding: 0;
          font-size: 0.875rem;
          color: var(--color-text-primary, #e2e8f0);
        }
        .blog-prose a { color: #a78bfa; text-decoration: underline; text-underline-offset: 2px; }
        .blog-prose a:hover { color: #c4b5fd; }
        .blog-prose img {
          max-width: 100%;
          border-radius: 0.5rem;
          margin: 1.5rem 0;
          border: 1px solid var(--color-border, #334155);
        }
        .blog-prose hr {
          border: none;
          border-top: 1px solid var(--color-border, #334155);
          margin: 2.5rem 0;
        }
        .blog-prose table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.9rem; }
        .blog-prose th, .blog-prose td {
          border: 1px solid var(--color-border, #334155);
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .blog-prose th { background: var(--color-bg-secondary, #1e293b); font-weight: 600; }
        .blog-prose strong { color: var(--color-text-primary, #f1f5f9); }
      `}</style>
    </main>
  );
}
