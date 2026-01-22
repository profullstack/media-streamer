/**
 * File Download Hook
 *
 * Shared utility for downloading files with retry logic and progress tracking.
 * Used by ebook readers and other components that need to download non-streaming files.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Download state
 */
export interface DownloadState {
  /** Whether download is in progress */
  isDownloading: boolean;
  /** Download progress percentage (0-100), null if total size unknown */
  progress: number | null;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes to download, 0 if unknown */
  totalBytes: number;
  /** Downloaded file data as ArrayBuffer */
  data: ArrayBuffer | null;
  /** Error if download failed */
  error: Error | null;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Expected file size in bytes (fallback if Content-Length not available) */
  expectedSize?: number;
  /** Maximum retry attempts for 5xx errors (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 2000) */
  retryDelayMs?: number;
  /** Callback when download completes */
  onComplete?: (data: ArrayBuffer) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Callback for progress updates */
  onProgress?: (progress: number | null, downloadedBytes: number, totalBytes: number) => void;
}

/**
 * Download hook return type
 */
export interface UseFileDownloadReturn extends DownloadState {
  /** Manually trigger a retry */
  retry: () => void;
}

/**
 * Hook for downloading files with retry logic and progress tracking
 *
 * @param url - URL to download from, or null to skip download
 * @param options - Download options
 * @returns Download state and retry function
 *
 * @example
 * ```tsx
 * const { isDownloading, progress, data, error, retry } = useFileDownload(
 *   streamUrl,
 *   { expectedSize: fileInfo.size, onError: handleError }
 * );
 *
 * if (isDownloading) return <LoadingSpinner progress={progress} />;
 * if (error) return <ErrorDisplay error={error} onRetry={retry} />;
 * if (data) return <FileViewer data={data} />;
 * ```
 */
export function useFileDownload(
  url: string | null,
  options: DownloadOptions = {}
): UseFileDownloadReturn {
  const {
    expectedSize = 0,
    maxRetries = 3,
    retryDelayMs = 2000,
    onComplete,
    onError,
    onProgress,
  } = options;

  const [state, setState] = useState<DownloadState>({
    isDownloading: !!url,
    progress: null,
    downloadedBytes: 0,
    totalBytes: 0,
    data: null,
    error: null,
  });

  const [retryCount, setRetryCount] = useState(0);

  // Retry function
  const retry = useCallback(() => {
    setState({
      isDownloading: true,
      progress: null,
      downloadedBytes: 0,
      totalBytes: 0,
      data: null,
      error: null,
    });
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!url) {
      setState((prev) => ({ ...prev, isDownloading: false }));
      return;
    }

    let aborted = false;
    const abortController = new AbortController();

    const fetchWithRetry = async (
      fetchUrl: string,
      retriesLeft: number
    ): Promise<Response> => {
      try {
        const response = await fetch(fetchUrl, { signal: abortController.signal });

        if (!response.ok) {
          // Retry on 503 (torrent not ready) or other 5xx server errors
          if (response.status >= 500 && retriesLeft > 0) {
            console.log(
              `[useFileDownload] Got ${response.status}, retrying in ${retryDelayMs}ms... (${retriesLeft} retries left)`
            );
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            return fetchWithRetry(fetchUrl, retriesLeft - 1);
          }
          throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        return response;
      } catch (err) {
        // Don't retry if aborted
        if (aborted) throw err;

        // Retry on network errors
        if (retriesLeft > 0 && err instanceof TypeError) {
          console.log(
            `[useFileDownload] Network error, retrying in ${retryDelayMs}ms... (${retriesLeft} retries left)`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          return fetchWithRetry(fetchUrl, retriesLeft - 1);
        }
        throw err;
      }
    };

    const download = async (): Promise<void> => {
      try {
        setState({
          isDownloading: true,
          progress: null,
          downloadedBytes: 0,
          totalBytes: 0,
          data: null,
          error: null,
        });

        const response = await fetchWithRetry(url, maxRetries);

        // Get total size from Content-Length or fall back to expectedSize
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : expectedSize;

        setState((prev) => ({ ...prev, totalBytes: total }));

        // If streaming not supported, fall back to arrayBuffer()
        if (!response.body) {
          const buffer = await response.arrayBuffer();
          if (aborted) return;

          setState({
            isDownloading: false,
            progress: 100,
            downloadedBytes: buffer.byteLength,
            totalBytes: buffer.byteLength,
            data: buffer,
            error: null,
          });
          onProgress?.(100, buffer.byteLength, buffer.byteLength);
          onComplete?.(buffer);
          return;
        }

        // Stream the response with progress tracking
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (aborted) {
            reader.cancel();
            return;
          }

          chunks.push(value);
          receivedLength += value.length;

          const progress = total > 0 ? Math.round((receivedLength / total) * 100) : null;

          setState((prev) => ({
            ...prev,
            downloadedBytes: receivedLength,
            progress,
          }));

          onProgress?.(progress, receivedLength, total);
        }

        // Combine chunks into ArrayBuffer
        const buffer = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, position);
          position += chunk.length;
        }

        if (aborted) return;

        setState({
          isDownloading: false,
          progress: 100,
          downloadedBytes: receivedLength,
          totalBytes: total || receivedLength,
          data: buffer.buffer,
          error: null,
        });

        onProgress?.(100, receivedLength, total || receivedLength);
        onComplete?.(buffer.buffer);
      } catch (err) {
        if (aborted) return;

        const error = err instanceof Error ? err : new Error('Download failed');
        setState((prev) => ({
          ...prev,
          isDownloading: false,
          error,
        }));
        onError?.(error);
      }
    };

    void download();

    return () => {
      aborted = true;
      abortController.abort();
    };
  }, [url, expectedSize, maxRetries, retryDelayMs, retryCount, onComplete, onError, onProgress]);

  return {
    ...state,
    retry,
  };
}

/**
 * Format bytes as human-readable string
 */
export function formatDownloadProgress(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
