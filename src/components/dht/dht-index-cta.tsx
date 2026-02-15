'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

interface DhtIndexCtaProps {
  infohash: string;
  magnetUri: string;
}

export function DhtIndexCta({ infohash, magnetUri }: DhtIndexCtaProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSuccess = useCallback((torrent: { id: string }) => {
    setIsModalOpen(false);
    setTimeout(() => {
      router.push(`/torrents/${torrent.id}`);
    }, 100);
  }, [router]);

  return (
    <p className="mt-2">
      Want to stream this directly in your browser?{' '}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="text-accent-primary hover:underline"
      >
        Index this torrent
      </button>{' '}
      to unlock streaming, metadata enrichment, and more.

      <AddMagnetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        initialMagnetUrl={magnetUri}
      />
    </p>
  );
}
