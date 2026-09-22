import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin';
import { getServerClient } from '@/lib/supabase';
import { IntegrationsManager } from '../integrations-form';
import type { IntegrationKind } from '@/app/actions/integrations';

export const dynamic = 'force-dynamic';

type Integration = {
  id: string;
  name: string;
  kind: IntegrationKind;
  access_token: string;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
};

type Post = {
  id: string;
  slug: string;
  title: string;
  source: string;
  published_at: string;
};

export default async function AdminIntegrationsPage() {
  await requireAdminPage('/admin/integrations');

  const svc = getServerClient() as any;
  const [{ data: integrationsRaw }, { data: postsRaw }] = await Promise.all([
    svc
      .from('autoblog_integrations')
      .select('id, name, kind, access_token, request_count, last_used_at, created_at')
      .order('created_at', { ascending: false }),
    svc
      .from('blog_posts')
      .select('id, slug, title, source, published_at')
      .order('published_at', { ascending: false })
      .limit(20),
  ]);

  const integrations = (integrationsRaw ?? []) as Integration[];
  const posts = (postsRaw ?? []) as Post[];

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Autoblog integrations</h2>
          <p className="mt-1 text-sm text-text-muted">
            Generate a bearer token, then paste it into{' '}
            <a href="https://crawlproof.com" className="underline">CrawlProof</a>{' '}
            or Outrank as the webhook secret. The token doubles as the HMAC signing secret.
          </p>
        </div>
        <IntegrationsManager initial={integrations} />
      </section>

      <section className="space-y-3 rounded-lg border border-border-subtle bg-bg-secondary p-5">
        <h2 className="text-lg font-semibold text-text-primary">Recent blog posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-text-muted">No posts ingested yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/blog/${p.slug}`} className="text-text-primary underline hover:opacity-80">{p.title}</Link>
                  </td>
                  <td className="py-2 pr-4 text-text-muted">{p.source}</td>
                  <td className="py-2 text-text-muted">{p.published_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
