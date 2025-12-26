'use client';

/**
 * Add Magnet Modal Component
 * 
 * Modal for submitting magnet URLs to index torrents with real-time progress.
 */

import { useState, useCallback, useRef } from 'react';
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

/**
 * Progress event from SSE stream
 */
interface ProgressEvent {
  stage: 'connecting' | 'searching' | 'downloading' | 'complete' | 'error';
  progress: number;
  numPeers: number;
  elapsedMs: number;
  message: string;
  infohash: string;
}

/**
 * Complete event from SSE stream
 */
interface CompleteEvent {
  torrentId: string;
  infohash: string;
  name: string;
  fileCount: number;
  totalSize: number;
  isNew: boolean;
}

/**
 * Error event from SSE stream
 */
interface ErrorEvent {
  error: string;
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
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      setError(null);
      setSuccess(null);
      setProgress(null);

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

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/torrents/index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ magnetUri: trimmedUri }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json() as { error?: string };
          setError(errorData.error ?? 'Failed to add torrent');
          setIsSubmitting(false);
          return;
        }

        // Handle SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          setError('Failed to read response stream');
          setIsSubmitting(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            } else if (line === '' && eventType && eventData) {
              // Process complete event
              try {
                const data = JSON.parse(eventData) as unknown;

                switch (eventType) {
                  case 'progress': {
                    const progressData = data as ProgressEvent;
                    setProgress(progressData);
                    break;
                  }
                  case 'complete': {
                    const completeData = data as CompleteEvent;
                    setSuccess(`Successfully added "${completeData.name}"`);
                    setProgress(null);
                    if (onSuccess) {
                      onSuccess({
                        id: completeData.torrentId,
                        infohash: completeData.infohash,
                        name: completeData.name,
                        totalSize: completeData.totalSize,
                        fileCount: completeData.fileCount,
                      });
                    }
                    setMagnetUri('');
                    break;
                  }
                  case 'existing': {
                    const existingData = data as CompleteEvent;
                    setSuccess(`Torrent "${existingData.name}" already exists`);
                    setProgress(null);
                    if (onSuccess) {
                      onSuccess({
                        id: existingData.torrentId,
                        infohash: existingData.infohash,
                        name: existingData.name,
                        totalSize: existingData.totalSize,
                        fileCount: existingData.fileCount,
                      });
                    }
                    setMagnetUri('');
                    break;
                  }
                  case 'error': {
                    const errorData = data as ErrorEvent;
                    setError(errorData.error);
                    setProgress(null);
                    break;
                  }
                }
              } catch {
                // Ignore JSON parse errors
              }

              eventType = '';
              eventData = '';
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled
          setError('Request cancelled');
        } else {
          setError('Network error. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
        abortControllerRef.current = null;
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
    // Cancel any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMagnetUri('');
    setError(null);
    setSuccess(null);
    setProgress(null);
    onClose();
  }, [onClose]);

  // Get progress bar color based on stage
  const getProgressColor = (stage: string): string => {
    switch (stage) {
      case 'connecting':
        return 'bg-yellow-500';
      case 'searching':
        return 'bg-blue-500';
      case 'downloading':
        return 'bg-accent-primary';
      case 'complete':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-accent-primary';
    }
  };

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

        {/* Progress bar */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{progress.message}</span>
              <span className="text-text-muted">
                {progress.numPeers > 0 && `${progress.numPeers} peer${progress.numPeers > 1 ? 's' : ''} • `}
                {Math.round(progress.elapsedMs / 1000)}s
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className={cn(
                  'h-full transition-all duration-300 ease-out',
                  getProgressColor(progress.stage)
                )}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="capitalize">{progress.stage}</span>
              <span>{progress.progress}%</span>
            </div>
          </div>
        )}

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
            {isSubmitting ? 'Cancel' : 'Close'}
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
