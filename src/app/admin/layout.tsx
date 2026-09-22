import { requireAdminPage } from '@/lib/admin';
import { MainLayout } from '@/components/layout/main-layout';
import { AdminNav } from './admin-nav';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin | BitTorrented',
  robots: { index: false, follow: false },
};

/**
 * Every admin page is gated here and again in the page itself, so a page that
 * renders on its own (client navigation, revalidation) is never unguarded.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Admin</h1>
            <p className="mt-1 text-sm text-text-muted">Signed in as {user.email}</p>
          </div>
          <AdminNav />
        </div>
        {children}
      </div>
    </MainLayout>
  );
}
