'use client';

/**
 * Add Magnet Modal Component
 *
 * Modal for adding new magnet URLs to the catalog.
 * After successful ingestion, triggers metadata enrichment to fetch
 * album covers, posters, and other metadata from external APIs.
 */

import React, { useState, useCallback } from 'react';

export interface AddMagnetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Basic magnet URL validation
function isValidMagnetUrl(url: string): boolean {
  return url.startsWith('magnet:?xt=urn:btih:');
}

/**
 * Trigger metadata enrichment for a torrent (fire and forget)
 * This fetches album covers, posters, etc. from external APIs
 */
async function triggerEnrichment(torrentId: string): Promise<void> {
  try {
    console.log('[AddMagnetModal] Triggering enrichment for torrent:', torrentId);
    const response = await fetch(`/api/torrents/${torrentId}/enrich`, {
      method: 'POST',
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[AddMagnetModal] Enrichment result:', {
        contentType: data.enrichment?.contentType,
        hasPoster: !!data.enrichment?.posterUrl,
        hasCover: !!data.enrichment?.coverUrl,
        updated: data.updated,
      });
    } else {
      console.warn('[AddMagnetModal] Enrichment failed:', response.status);
    }
  } catch (error) {
    // Don't fail the whole operation if enrichment fails
    console.warn('[AddMagnetModal] Enrichment error:', error);
  }
}

export function AddMagnetModal({ isOpen, onClose, onSuccess }: AddMagnetModalProps): React.ReactElement | null {
  const [magnetUrl, setMagnetUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus('');

    // Validate magnet URL
    if (!isValidMagnetUrl(magnetUrl)) {
      setError('Invalid magnet URL. Must start with magnet:?xt=urn:btih:');
      return;
    }

    setIsLoading(true);
    setStatus('Adding torrent...');

    try {
      // Note: API expects magnetUri, not magnetUrl
      const response = await fetch('/api/magnets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ magnetUri: magnetUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to add torrent');
        return;
      }

      // Trigger metadata enrichment in the background
      // This fetches album covers, posters, etc.
      if (data.torrentId && !data.isDuplicate) {
        setStatus('Fetching metadata...');
        // Fire and forget - don't wait for enrichment to complete
        triggerEnrichment(data.torrentId);
      }

      // Success - reset form and notify parent
      setMagnetUrl('');
      setStatus('');
      onSuccess();
      onClose();
    } catch {
      setError('Failed to add torrent. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [magnetUrl, onClose, onSuccess]);

  const handleClose = useCallback(() => {
    setMagnetUrl('');
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop - use fixed inset-0 to cover full viewport */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        data-testid="add-magnet-modal"
        className="relative z-10 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Add Magnet URL
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label 
              htmlFor="magnet-url" 
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Magnet URL
            </label>
            <input
              id="magnet-url"
              type="text"
              value={magnetUrl}
              onChange={(e) => setMagnetUrl(e.target.value)}
              placeholder="magnet:?xt=urn:btih:..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={isLoading}
            />
            {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p> : null}
            {status && !error ? <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                {status}
              </p> : null}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !magnetUrl}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Torrent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
