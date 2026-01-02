/**
 * Hooks Module
 *
 * Client-side React hooks
 */

export { useAuth } from './use-auth';
export type { AuthUser, UseAuthResult } from './use-auth';

export { useAnalytics } from './use-analytics';
export type { UseAnalyticsResult } from './use-analytics';

export { useWebTorrent, isNativeCompatible, NATIVE_VIDEO_FORMATS, NATIVE_AUDIO_FORMATS } from './use-webtorrent';
export type { StreamStatus, StreamOptions, WebTorrentState, UseWebTorrentReturn } from './use-webtorrent';

export { useTvDetection, isTvBrowser, getTvBrowserType, detectTvFromUserAgent } from './use-tv-detection';
export type { TvBrowserType, TvDetectionResult } from './use-tv-detection';
