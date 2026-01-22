// Format bytes to human readable size
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return 'Unknown';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Generate a unique request ID
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}${random}`;
}

// Sanitize search query
export function sanitizeQuery(query: string): string {
  return query
    .trim()
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .substring(0, 200); // Limit length
}

// Validate infohash (40 hex characters)
export function isValidInfohash(infohash: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(infohash);
}

// Format duration in milliseconds to readable string
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
