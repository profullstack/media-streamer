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
          className="prose prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      ) : (
        <article className="mt-8 whitespace-pre-line text-lg">{post.excerpt}</article>
      )}
    </main>
  );
}
