/**
 * Folder Metadata Module
 *
 * Extracts and enriches folder-level metadata for discographies
 * and multi-album torrents.
 */

export {
  extractAlbumFolders,
  enrichAlbumFolder,
  type AlbumFolder,
  type FileWithPath,
  type FolderEnrichmentOptions,
  type FolderEnrichmentResult,
} from './folder-metadata';
