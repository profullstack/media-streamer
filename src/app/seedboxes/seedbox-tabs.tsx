'use client';

/**
 * Seedboxes inner navigation.
 *
 * Left sub-nav for the Seedboxes page: "Setup" (connect/configure the seedbox)
 * and "Torlink status" (live per-torrent progress/speeds/seeding). Mirrors the
 * settings-page tab pattern.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DownloadIcon, SettingsIcon, CreditCardIcon } from '@/components/ui/icons';
import { SeedboxSection } from '@/app/settings/seedbox-section';
import { TorlinkStatus } from './torlink-status';
import { RentOut } from './rent-out';

type SeedboxTab = 'setup' | 'status' | 'rent';

const TABS: { id: SeedboxTab; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'setup', label: 'Setup', icon: SettingsIcon },
  { id: 'status', label: 'Torlink status', icon: DownloadIcon },
  { id: 'rent', label: 'Rent Out', icon: CreditCardIcon },
];

export function SeedboxTabs(): React.ReactElement {
  const [tab, setTab] = useState<SeedboxTab>('setup');

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex gap-2 lg:w-48 lg:shrink-0 lg:flex-col">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
              tab === id
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {tab === 'setup' && <SeedboxSection />}
        {tab === 'status' && <TorlinkStatus />}
        {tab === 'rent' && <RentOut />}
      </div>
    </div>
  );
}
