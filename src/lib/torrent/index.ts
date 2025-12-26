/**
 * Torrent Module
 * 
 * Provides WebTorrent-based metadata fetching for torrents.
 * This is a SERVER-SIDE ONLY module.
 */

export {
  TorrentService,
  TorrentMetadataError,
  TorrentTimeoutError,
} from './torrent';

export type {
  TorrentMetadata,
  TorrentFileInfo,
  TorrentServiceOptions,
} from './torrent';
