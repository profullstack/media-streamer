'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

interface DhtActionsProps {
  magnetUri: string;
  infohash: string;
}

export function DhtActions({ magnetUri, infohash }: DhtActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(magnetUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = magnetUri;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [magnetUri]);

  const handleIndexSuccess = useCallback((torrent: { id: string }) => {
    setIsModalOpen(false);
    setTimeout(() => {
      router.push(`/torrents/${torrent.id}`);
    }, 100);
  }, [router]);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
        >
          ⚡ Index &amp; Stream This Torrent
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm"
        >
          {copied ? '✅ Copied!' : '🧲 Copy Magnet URL'}
        </button>
      </div>

      <AddMagnetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleIndexSuccess}
        initialMagnetUrl={magnetUri}
      />
    </>
  );
}
