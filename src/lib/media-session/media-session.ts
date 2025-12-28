/**
 * Media Session API Integration
 * 
 * Provides integration with the Media Session API for displaying
 * media metadata on iOS lock screen, CarPlay, Android lock screen,
 * and other media control surfaces.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
 */

/**
 * Media session metadata
 */
export interface MediaSessionMetadata {
  /** Track title */
  title: string;
  /** Artist name */
  artist?: string;
  /** Album name */
  album?: string;
  /** Cover art URL */
  artwork?: string;
}

/**
 * Position state for media session
 */
export interface MediaSessionPositionState {
  /** Total duration in seconds */
  duration: number;
  /** Current position in seconds */
  position: number;
  /** Playback rate (default: 1) */
  playbackRate?: number;
}

/**
 * Action handlers for media session controls
 */
export interface MediaSessionActionHandlers {
  /** Play action */
  play?: MediaSessionActionHandler | undefined;
  /** Pause action */
  pause?: MediaSessionActionHandler | undefined;
  /** Seek backward action */
  seekbackward?: MediaSessionActionHandler | undefined;
  /** Seek forward action */
  seekforward?: MediaSessionActionHandler | undefined;
  /** Previous track action */
  previoustrack?: MediaSessionActionHandler | undefined;
  /** Next track action */
  nexttrack?: MediaSessionActionHandler | undefined;
  /** Stop action */
  stop?: MediaSessionActionHandler | undefined;
  /** Seek to specific position action */
  seekto?: MediaSessionActionHandler | undefined;
}

/**
 * Artwork sizes to generate for different devices
 * iOS uses 96x96, 128x128, 256x256, 512x512
 */
const ARTWORK_SIZES = ['96x96', '128x128', '256x256', '512x512'] as const;

/**
 * Detect image type from URL
 */
function getImageType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.png')) return 'image/png';
  if (lowerUrl.includes('.webp')) return 'image/webp';
  if (lowerUrl.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Check if Media Session API is available
 */
function isMediaSessionAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

/**
 * Check if MediaMetadata constructor is available
 */
function isMediaMetadataAvailable(): boolean {
  return typeof MediaMetadata !== 'undefined';
}

/**
 * Set media session metadata
 * 
 * This updates the metadata displayed on iOS lock screen, CarPlay,
 * Android lock screen, and other media control surfaces.
 * 
 * @param metadata - The metadata to display
 */
export function setMediaSessionMetadata(metadata: MediaSessionMetadata): void {
  if (!isMediaSessionAvailable() || !isMediaMetadataAvailable()) {
    return;
  }

  const artwork: MediaImage[] = metadata.artwork
    ? ARTWORK_SIZES.map((size) => ({
        src: metadata.artwork!,
        sizes: size,
        type: getImageType(metadata.artwork!),
      }))
    : [];

  navigator.mediaSession.metadata = new MediaMetadata({
    title: metadata.title,
    artist: metadata.artist ?? '',
    album: metadata.album ?? '',
    artwork,
  });
}

/**
 * Update media session playback state
 * 
 * @param state - The playback state ('playing', 'paused', or 'none')
 */
export function updateMediaSessionPlaybackState(
  state: MediaSessionPlaybackState
): void {
  if (!isMediaSessionAvailable()) {
    return;
  }

  navigator.mediaSession.playbackState = state;
}

/**
 * Update media session position state
 * 
 * This updates the progress bar on the lock screen and media controls.
 * 
 * @param positionState - The position state
 */
export function updateMediaSessionPositionState(
  positionState: MediaSessionPositionState
): void {
  if (!isMediaSessionAvailable()) {
    return;
  }

  navigator.mediaSession.setPositionState({
    duration: positionState.duration,
    position: positionState.position,
    playbackRate: positionState.playbackRate ?? 1,
  });
}

/**
 * Set media session action handlers
 * 
 * These handlers respond to media control buttons on the lock screen,
 * CarPlay, headphones, etc.
 * 
 * @param handlers - The action handlers to set
 */
export function setMediaSessionActionHandlers(
  handlers: MediaSessionActionHandlers
): void {
  if (!isMediaSessionAvailable()) {
    return;
  }

  const actions: MediaSessionAction[] = [
    'play',
    'pause',
    'seekbackward',
    'seekforward',
    'previoustrack',
    'nexttrack',
    'stop',
    'seekto',
  ];

  for (const action of actions) {
    const handler = handlers[action as keyof MediaSessionActionHandlers];
    navigator.mediaSession.setActionHandler(
      action,
      handler !== undefined ? handler : null
    );
  }
}

/**
 * Clear media session
 * 
 * Clears all metadata, playback state, and action handlers.
 */
export function clearMediaSession(): void {
  if (!isMediaSessionAvailable()) {
    return;
  }

  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = 'none';

  const actions: MediaSessionAction[] = [
    'play',
    'pause',
    'seekbackward',
    'seekforward',
    'previoustrack',
    'nexttrack',
    'stop',
    'seekto',
  ];

  for (const action of actions) {
    navigator.mediaSession.setActionHandler(action, null);
  }
}
