import { getServerClient } from '@/lib/supabase';

export type Post = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  html: string | null;
  image_url: string | null;
  source: string;
};

type BlogPostRow = {
  slug: string;
  title: string;
  meta_description: string | null;
  content_html: string | null;
  image_url: string | null;
  published_at: string;
  source: string;
};

function rowToPost(row: BlogPostRow): Post {
  return {
    slug: row.slug,
    title: row.title,
    date: row.published_at.slice(0, 10),
    excerpt: row.meta_description ?? '',
    html: row.content_html,
    image_url: row.image_url,
    source: row.source,
  };
}

const FIELDS = 'slug, title, meta_description, content_html, image_url, published_at, source';

export async function loadAllPosts(): Promise<Post[]> {
  try {
    const sb = getServerClient();
    const { data, error } = await sb
      .from('blog_posts')
      .select(FIELDS)
      .order('published_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as BlogPostRow[]).map(rowToPost);
  } catch {
    return [];
  }
}

export async function findPost(slug: string): Promise<Post | undefined> {
  try {
    const sb = getServerClient();
    const { data } = await sb
      .from('blog_posts')
      .select(FIELDS)
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return undefined;
    return rowToPost(data as BlogPostRow);
  } catch {
    return undefined;
  }
}
