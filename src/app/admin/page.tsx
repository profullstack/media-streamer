import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getServerClient } from '@/lib/supabase';

export const metadata = {
  title: 'Admin | BitTorrented',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type Integration = {
  id: string;
  name: string;
  kind: string;
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

  const { data: adminRow } = await svc
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  // 404 so a non-admin who guesses the URL gets no confirmation it exists.
  if (!adminRow) notFound();

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
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Logged in as {user.email}</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-lg font-semibold">Autoblog integrations</h2>
        <p className="text-sm text-muted-foreground">
          Bearer tokens for inbound autoblog webhooks. Each token is also the HMAC
          secret for Standard Webhooks signature verification. Add tokens via
          database insert into <code>autoblog_integrations</code>.
        </p>
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No integrations configured.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Kind</th>
                <th className="py-2 pr-4 text-right">Requests</th>
                <th className="py-2">Last used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {integrations.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-4 font-medium">{i.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{i.kind}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{i.request_count}</td>
                  <td className="py-2 text-muted-foreground">
                    {i.last_used_at ? new Date(i.last_used_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                    <a href={`/blog/${p.slug}`} className="underline hover:opacity-80">
                      {p.title}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.source}</td>
                  <td className="py-2 text-muted-foreground">
                    {p.published_at.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
