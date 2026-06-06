import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EmailContent } from './email-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Email | BitTorrented',
  description: 'Read email from connected accounts',
};

export default async function EmailPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/email');
  }

  return <EmailContent />;
}
