'use client';

/**
 * Add Magnet Modal Component
 * 
 * Modal for submitting magnet URLs to index torrents.
 */

import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { MagnetIcon, LoadingSpinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface AddMagnetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (torrent: TorrentResult) => void;
}

interface TorrentResult {
  id: string;
  infohash: string;
  name: string;
  totalSize: number;
  fileCount: number;
}

interface ApiResponse {
  success: boolean;
  torrent?: TorrentResult;
  error?: string;
  alreadyExists?: boolean;
}

export function AddMagnetModal({
  isOpen,
  onClose,
  onSuccess,
}: AddMagnetModalProps): React.ReactElement {
  const [magnetUri, setMagnetUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      const trimmedUri = magnetUri.trim();
      if (!trimmedUri) {
        setError('Please enter a magnet URL');
        return;
      }

      if (!trimmedUri.startsWith('magnet:?')) {
        setError('Invalid magnet URL format');
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch('/api/torrents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ magnetUri: trimmedUri }),
        });

        const data: ApiResponse = await response.json();

        if (!response.ok) {
          setError(data.error ?? 'Failed to add torrent');
          return;
        }

        if (data.alreadyExists) {
          setSuccess(`Torrent "${data.torrent?.name}" already exists`);
        } else {
          setSuccess(`Successfully added "${data.torrent?.name}"`);
        }

        if (data.torrent && onSuccess) {
          onSuccess(data.torrent);
        }

        // Clear input after success
        setMagnetUri('');
      } catch (err) {
        setError('Network error. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [magnetUri, onSuccess]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setMagnetUri(e.target.value);
    setError(null);
    setSuccess(null);
  }, []);

  const handleClose = useCallback((): void => {
    setMagnetUri('');
    setError(null);
    setSuccess(null);
    onClose();
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Magnet Link" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info text */}
        <p className="text-sm text-text-secondary">
          Paste a magnet URL to index the torrent. Only metadata will be fetched - no content is
          downloaded until you stream a file.
        </p>

        {/* Magnet input */}
        <div>
          <label htmlFor="magnet-uri" className="mb-2 block text-sm font-medium text-text-primary">
            Magnet URL
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-3 text-text-muted">
              <MagnetIcon size={18} />
            </div>
            <textarea
              id="magnet-uri"
              value={magnetUri}
              onChange={handleInputChange}
              placeholder="magnet:?xt=urn:btih:..."
              rows={3}
              className={cn(
                'w-full resize-none rounded-lg border bg-bg-tertiary py-3 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary',
                error ? 'border-red-500' : 'border-border-default'
              )}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Success message */}
        {success && (
          <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {success}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="btn-secondary px-4 py-2 text-sm"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary px-4 py-2 text-sm"
            disabled={isSubmitting || !magnetUri.trim()}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner className="mr-2" size={16} />
                Indexing...
              </>
            ) : (
              'Add Torrent'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
