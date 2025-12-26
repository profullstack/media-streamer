/**
 * Collections Module Exports
 */

export {
  createCollection,
  validateCollection,
  addItemToCollection,
  removeItemFromCollection,
  getCollectionItems,
  reorderCollectionItems,
  updateCollection,
  deleteCollection,
  isItemInCollection,
  getCollectionsByType,
  getCollectionsByUser,
  createFavorite,
  createPlaylist,
  createWatchlist,
  createReadingList,
} from './collections';

export type {
  Collection,
  CollectionItem,
  CollectionType,
  MediaType,
  CreateCollectionOptions,
  AddItemOptions,
  UpdateCollectionOptions,
} from './collections';
