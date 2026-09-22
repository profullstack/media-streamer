import { listAuthUserEmails, requireAdminPage } from '@/lib/admin';
import { BroadcastForm } from './broadcast-form';

export const dynamic = 'force-dynamic';

export default async function AdminEmailPage() {
  const user = await requireAdminPage('/admin/email');

  const recipients = await listAuthUserEmails().catch((error) => {
    console.error('[Admin] Failed to count auth users:', error);
    return [] as string[];
  });

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-secondary p-5">
      <BroadcastForm recipientCount={recipients.length} adminEmail={user.email} />
    </section>
  );
}
