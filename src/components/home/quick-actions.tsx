import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
'use client';

/**
 * Quick Actions Component
 *
 * Client component for the homepage quick actions section.
 * Handles the "Add Torrent" button to open the magnet modal.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { MagnetIcon, SearchIcon, MusicIcon, VideoIcon } from '@/components/ui/icons';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

interface QuickActionCardProps {
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
  color: string;
}

function QuickActionCard({
  href,
  onClick,
  icon: Icon,
  title,
  description,
  color,
}: QuickActionCardProps): React.ReactElement {
  const content = (
    <>
      <div className={`mb-3 rounded-full bg-${color}/20 p-3`}>
        <Icon className={`text-${color}`} size={24} />
      </div>
      <h3 className="font-medium text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="card-hover flex flex-col items-center p-6 text-center transition-transform hover:scale-[1.02] w-full"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href ?? '#'}
      className="card-hover flex flex-col items-center p-6 text-center transition-transform hover:scale-[1.02]"
    >
      {content}
    </Link>
  );
}

export function QuickActions(): React.ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  const handleOpenModal = useCallback((): void => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setIsModalOpen(true);
  }, [isLoggedIn, router]);

  const handleCloseModal = useCallback((): void => {
    setIsModalOpen(false);
  }, []);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          onClick={handleOpenModal}
          icon={MagnetIcon}
          title={isLoggedIn ? 'Add Torrent' : 'Add Torrent 🔒'}
          description={isLoggedIn ? 'Add a magnet link to start streaming' : 'Login required to add torrents'}
          color="accent-primary"
        />
        <QuickActionCard
          href="/search"
          icon={SearchIcon}
          title="Search"
          description="Search across all your media"
          color="accent-secondary"
        />
        <QuickActionCard
          href="/music"
          icon={MusicIcon}
          title="Music"
          description="Browse your music collection"
          color="accent-audio"
        />
        <QuickActionCard
          href="/videos"
          icon={VideoIcon}
          title="Videos"
          description="Watch movies and shows"
          color="accent-video"
        />
      </section>

      <AddMagnetModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </>
  );
}
