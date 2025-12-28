/**
 * Metadata Enrichment Module
 * 
 * Exports for automatic metadata fetching during torrent indexing.
 */

export {
  detectContentType,
  extractSearchQuery,
  enrichTorrentMetadata,
  type ContentType,
  type SearchQuery,
  type EnrichmentOptions,
  type EnrichmentResult,
} from './metadata-enrichment';
