'use client';

/**
 * Add Playlist Modal Component
 * 
 * Modal for adding IPTV playlists with name, M3U URL, and optional EPG URL fields.
 */

import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner, TvIcon, LinkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

export interface PlaylistData {
  id: string;
  name: string;
  m3uUrl: string;
  epgUrl?: string;
}

interface AddPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (playlist: PlaylistData) => void;
}

/**
 * Validates if a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AddPlaylistModal({
  isOpen,
  onClose,
  onSuccess,
}: AddPlaylistModalProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetFormFields = useCallback((): void => {
    setName('');
    setM3uUrl('');
    setEpgUrl('');
  }, []);

  const resetForm = useCallback((): void => {
    resetFormFields();
    setError(null);
    setSuccess(null);
  }, [resetFormFields]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      const trimmedName = name.trim();
      const trimmedM3uUrl = m3uUrl.trim();
      const trimmedEpgUrl = epgUrl.trim();

      // Validate name
      if (!trimmedName) {
        setError('Please enter a playlist name');
        return;
      }

      // Validate M3U URL
      if (!trimmedM3uUrl) {
        setError('Please enter an M3U URL');
        return;
      }

      if (!isValidUrl(trimmedM3uUrl)) {
        setError('Please enter a valid URL for the M3U playlist');
        return;
      }

      // Validate EPG URL if provided
      if (trimmedEpgUrl && !isValidUrl(trimmedEpgUrl)) {
        setError('Please enter a valid EPG URL');
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch('/api/iptv/playlists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: trimmedName,
            m3uUrl: trimmedM3uUrl,
            epgUrl: trimmedEpgUrl || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          setError(errorData.error ?? 'Failed to add playlist');
          setIsSubmitting(false);
          return;
        }

        const playlistData = await response.json() as PlaylistData;
        setSuccess(`Successfully added "${playlistData.name}"`);
        
        if (onSuccess) {
          onSuccess(playlistData);
        }
        
        // Only reset form fields, keep success message visible
        resetFormFields();
      } catch (err) {
        if (err instanceof Error) {
          setError(`Network error: ${err.message}`);
        } else {
          setError('Network error. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, m3uUrl, epgUrl, onSuccess, resetFormFields]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setName(e.target.value);
    setError(null);
  }, []);

  const handleM3uUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setM3uUrl(e.target.value);
    setError(null);
  }, []);

  const handleEpgUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setEpgUrl(e.target.value);
    setError(null);
  }, []);

  const handleClose = useCallback((): void => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add IPTV Playlist" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info text */}
        <p className="text-sm text-text-secondary">
          Add an IPTV playlist by providing the M3U URL. You can optionally include an EPG URL for program guide data.
        </p>

        {/* Playlist Name */}
        <div>
          <label htmlFor="playlist-name" className="mb-2 block text-sm font-medium text-text-primary">
            Playlist Name
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <TvIcon size={18} />
            </div>
            <input
              id="playlist-name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="My IPTV Playlist"
              className={cn(
                'w-full rounded-lg border bg-bg-tertiary py-3 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary',
                error && error.toLowerCase().includes('name') ? 'border-red-500' : 'border-border-default'
              )}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* M3U URL */}
        <div>
          <label htmlFor="m3u-url" className="mb-2 block text-sm font-medium text-text-primary">
            M3U URL
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <LinkIcon size={18} />
            </div>
            <input
              id="m3u-url"
              type="text"
              value={m3uUrl}
              onChange={handleM3uUrlChange}
              placeholder="http://example.com/playlist.m3u"
              className={cn(
                'w-full rounded-lg border bg-bg-tertiary py-3 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary',
                error && error.toLowerCase().includes('m3u') ? 'border-red-500' : 'border-border-default'
              )}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* EPG URL */}
        <div>
          <label htmlFor="epg-url" className="mb-2 block text-sm font-medium text-text-primary">
            EPG URL <span className="text-text-muted font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <LinkIcon size={18} />
            </div>
            <input
              id="epg-url"
              type="text"
              value={epgUrl}
              onChange={handleEpgUrlChange}
              placeholder="http://example.com/epg.xml"
              className={cn(
                'w-full rounded-lg border bg-bg-tertiary py-3 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary',
                error && error.toLowerCase().includes('epg') ? 'border-red-500' : 'border-border-default'
              )}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Error message */}
        {error ? (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        {/* Success message */}
        {success ? (
          <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {success}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="btn-secondary px-4 py-2 text-sm"
            disabled={isSubmitting}
          >
            Close
          </button>
          <button
            type="submit"
            className="btn-primary px-4 py-2 text-sm"
            disabled={isSubmitting || !name.trim() || !m3uUrl.trim()}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner className="mr-2" size={16} />
                Adding...
              </>
            ) : (
              'Add Playlist'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
