/**
 * Torrent Index Module
 *
 * Exports for magnet URL parsing, validation, and torrent file indexing.
 */

export {
  parseMagnetUri,
  validateMagnetUri,
  extractInfohash,
  detectMediaType,
  detectMimeType,
  getFileExtension,
  createTorrentRecord,
  createFileRecords,
  calculatePieceMapping,
  type ParsedMagnet,
  type TorrentRecord,
  type TorrentFileRecord,
  type PieceMapping,
  type TorrentFile,
} from './torrent-index';

export {
  ingestMagnet,
  getTorrentByInfohash,
  getTorrentFiles,
  updateTorrentStatus,
  deleteTorrent,
  storeTorrentFiles,
  updateTorrentMetadata,
  type IngestResult,
  type TorrentWithFiles,
  type UpdateStatusResult,
  type DeleteResult,
  type TorrentStatus,
  type TorrentFileInfo,
} from './ingestion';

export {
  searchTorrentFiles,
  searchTorrents,
  buildSearchQuery,
  sanitizeSearchInput,
  getSearchSuggestions,
  type SearchFilesOptions,
  type SearchTorrentsOptions,
  type FileSearchResult,
  type TorrentSearchResult,
  type SearchFilesResponse,
  type SearchTorrentsResponse,
} from './search';

export {
  triggerPostIngestionEnrichment,
  triggerCodecDetection,
  type PostIngestionOptions,
  type PostIngestionResult,
  type CodecDetectionOptions,
  type CodecDetectionResult,
} from './post-ingestion';
