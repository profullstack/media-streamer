'use client';

/**
 * Edit Playlist Modal Component
 * 
 * Modal for editing existing IPTV playlists with name, M3U URL, and optional EPG URL fields.
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner, TvIcon, LinkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { PlaylistData } from './add-playlist-modal';

interface EditPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: PlaylistData | null;
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

export function EditPlaylistModal({
  isOpen,
  onClose,
  playlist,
  onSuccess,
}: EditPlaylistModalProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initialize form with playlist data when modal opens
  useEffect(() => {
    if (playlist && isOpen) {
      setName(playlist.name);
      setM3uUrl(playlist.m3uUrl);
      setEpgUrl(playlist.epgUrl ?? '');
      setIsDefault(playlist.isDefault ?? false);
      setError(null);
      setSuccess(null);
    }
  }, [playlist, isOpen]);

  const resetForm = useCallback((): void => {
    setName('');
    setM3uUrl('');
    setEpgUrl('');
    setIsDefault(false);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      if (!playlist) return;
      
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
        const response = await fetch(`/api/iptv/playlists/${playlist.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: trimmedName,
            m3uUrl: trimmedM3uUrl,
            epgUrl: trimmedEpgUrl || undefined,
            isDefault,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          setError(errorData.error ?? 'Failed to update playlist');
          setIsSubmitting(false);
          return;
        }

        const playlistData = await response.json() as PlaylistData;
        setSuccess(`Successfully updated "${playlistData.name}"`);
        
        if (onSuccess) {
          onSuccess(playlistData);
        }
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
    [playlist, name, m3uUrl, epgUrl, isDefault, onSuccess]
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

  if (!playlist) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit IPTV Playlist" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info text */}
        <p className="text-sm text-text-secondary">
          Update your IPTV playlist settings. Changes will take effect immediately.
        </p>

        {/* Playlist Name */}
        <div>
          <label htmlFor="edit-playlist-name" className="mb-2 block text-sm font-medium text-text-primary">
            Playlist Name
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <TvIcon size={18} />
            </div>
            <input
              id="edit-playlist-name"
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
          <label htmlFor="edit-m3u-url" className="mb-2 block text-sm font-medium text-text-primary">
            M3U URL
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <LinkIcon size={18} />
            </div>
            <input
              id="edit-m3u-url"
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
          <label htmlFor="edit-epg-url" className="mb-2 block text-sm font-medium text-text-primary">
            EPG URL <span className="text-text-muted font-normal">(Optional)</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <LinkIcon size={18} />
            </div>
            <input
              id="edit-epg-url"
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

        {/* Default Provider Checkbox */}
        <div className="flex items-center gap-3">
          <input
            id="edit-is-default"
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className={cn(
              'h-5 w-5 rounded border-border-default bg-bg-tertiary',
              'text-accent-primary focus:ring-2 focus:ring-accent-primary focus:ring-offset-0',
              'cursor-pointer'
            )}
            disabled={isSubmitting}
          />
          <label htmlFor="edit-is-default" className="text-sm text-text-primary cursor-pointer">
            Set as default provider
          </label>
        </div>
        <p className="text-xs text-text-muted -mt-2">
          The default provider will be automatically selected when you visit Live TV.
        </p>

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
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary px-4 py-2 text-sm"
            disabled={isSubmitting || !name.trim() || !m3uUrl.trim()}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner className="mr-2" size={16} />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
