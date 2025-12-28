/**
 * Media Session API Module
 * 
 * Provides integration with the Media Session API for displaying
 * media metadata on iOS lock screen, CarPlay, Android lock screen,
 * and other media control surfaces.
 */

export {
  setMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
  setMediaSessionActionHandlers,
  clearMediaSession,
  type MediaSessionMetadata,
  type MediaSessionPositionState,
  type MediaSessionActionHandlers,
} from './media-session';
