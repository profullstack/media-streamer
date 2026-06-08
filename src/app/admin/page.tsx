import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { checkUserAdmin, listAuthUserEmails } from '@/lib/admin';
import { getServerClient } from '@/lib/supabase';
import { AdminTools } from './admin-tools';
import { IntegrationsManager } from './integrations-form';
import type { IntegrationKind } from '@/app/actions/integrations';

export const metadata = {
  title: 'Admin | BitTorrented',
  robots: { index: false, follow: false },
};

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

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin');

  const svc = getServerClient();
  const adminCheck = await checkUserAdmin(user.id, svc as any);
  if (!adminCheck.isAdmin) notFound();

  const [{ data: integrationsRaw }, { data: postsRaw }, recipientEmails] = await Promise.all([
    (svc as any)
      .from('autoblog_integrations')
      .select('id, name, kind, access_token, request_count, last_used_at, created_at')
      .order('created_at', { ascending: false }),
    (svc as any)
      .from('blog_posts')
      .select('id, slug, title, source, published_at')
      .order('published_at', { ascending: false })
      .limit(20),
    listAuthUserEmails(svc as any).catch((error) => {
      console.error('[Admin] Failed to count auth users:', error);
      return [];
    }),
  ]);

  const integrations = (integrationsRaw ?? []) as Integration[];
  const posts = (postsRaw ?? []) as Post[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Logged in as {user.email}</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <AdminTools recipientCount={recipientEmails.length} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Autoblog integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a bearer token, then paste it into{' '}
            <a href="https://crawlproof.com" className="underline">CrawlProof</a>{' '}
            or Outrank as the webhook secret. The token doubles as the HMAC signing secret.
          </p>
        </div>
        <IntegrationsManager initial={integrations} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-lg font-semibold">Recent blog posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts ingested yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/blog/${p.slug}`} className="underline hover:opacity-80">{p.title}</Link>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.source}</td>
                  <td className="py-2 text-muted-foreground">{p.published_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
