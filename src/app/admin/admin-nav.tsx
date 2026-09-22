'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TrendingIcon, UsersIcon, MailIcon, KeyIcon } from '@/components/ui/icons';

export const ADMIN_SECTIONS = [
  { href: '/admin', label: 'Overview', icon: TrendingIcon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/email', label: 'Email', icon: MailIcon },
  { href: '/admin/integrations', label: 'Integrations', icon: KeyIcon },
] as const;

export function AdminNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
      {ADMIN_SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
