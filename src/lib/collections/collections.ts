/**
 * Collections Module
 * 
 * User collections for favorites, playlists, watchlists, and reading lists
 */

import { randomUUID } from 'crypto';

// Types
export type CollectionType = 'favorites' | 'playlist' | 'watchlist' | 'reading_list';
export type MediaType = 'video' | 'audio' | 'ebook' | 'torrent';

export interface CollectionItem {
  id: string;
  mediaId: string;
  mediaType: MediaType;
  title: string;
  thumbnail?: string;
  addedAt: Date;
  position: number;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  type: CollectionType;
  description?: string;
  items: CollectionItem[];
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  deletedAt?: Date;
}

export interface CreateCollectionOptions {
  userId: string;
  name: string;
  type: CollectionType;
  description?: string;
  isPublic?: boolean;
}

export interface AddItemOptions {
  mediaId: string;
  mediaType: MediaType;
  title: string;
  thumbnail?: string;
}

export interface UpdateCollectionOptions {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

/**
 * Create a new collection
 */
export function createCollection(options: CreateCollectionOptions): Collection {
  const now = new Date();
  
  return {
    id: `col-${randomUUID()}`,
    userId: options.userId,
    name: options.name,
    type: options.type,
    description: options.description,
    items: [],
    createdAt: now,
    updatedAt: now,
    isPublic: options.isPublic ?? false,
  };
}

/**
 * Validate a collection
 */
export function validateCollection(collection: Collection): boolean {
  if (!collection.userId || collection.userId.trim() === '') {
    return false;
  }
  
  if (!collection.name || collection.name.trim() === '') {
    return false;
  }
  
  return true;
}

/**
 * Add item to collection
 */
export function addItemToCollection(
  collection: Collection,
  options: AddItemOptions
): Collection {
  // Check for duplicates
  if (isItemInCollection(collection, options.mediaId)) {
    return collection;
  }

  const newItem: CollectionItem = {
    id: `item-${randomUUID()}`,
    mediaId: options.mediaId,
    mediaType: options.mediaType,
    title: options.title,
    thumbnail: options.thumbnail,
    addedAt: new Date(),
    position: collection.items.length,
  };

  return {
    ...collection,
    items: [...collection.items, newItem],
    updatedAt: new Date(),
  };
}

/**
 * Remove item from collection
 */
export function removeItemFromCollection(
  collection: Collection,
  itemId: string
): Collection {
  return {
    ...collection,
    items: collection.items.filter(item => item.id !== itemId),
    updatedAt: new Date(),
  };
}

/**
 * Get collection items
 */
export function getCollectionItems(collection: Collection): CollectionItem[] {
  return collection.items;
}

/**
 * Reorder collection items
 */
export function reorderCollectionItems(
  collection: Collection,
  newOrder: string[]
): Collection {
  const itemMap = new Map(collection.items.map(item => [item.id, item]));
  
  const reorderedItems: CollectionItem[] = [];
  let position = 0;
  
  for (const itemId of newOrder) {
    const item = itemMap.get(itemId);
    if (item) {
      reorderedItems.push({ ...item, position });
      position++;
    }
  }

  return {
    ...collection,
    items: reorderedItems,
    updatedAt: new Date(),
  };
}

/**
 * Update collection
 */
export function updateCollection(
  collection: Collection,
  options: UpdateCollectionOptions
): Collection {
  return {
    ...collection,
    name: options.name ?? collection.name,
    description: options.description ?? collection.description,
    isPublic: options.isPublic ?? collection.isPublic,
    updatedAt: new Date(),
  };
}

/**
 * Delete collection (soft delete)
 */
export function deleteCollection(collection: Collection): Collection {
  return {
    ...collection,
    deletedAt: new Date(),
  };
}

/**
 * Check if item is in collection
 */
export function isItemInCollection(collection: Collection, mediaId: string): boolean {
  return collection.items.some(item => item.mediaId === mediaId);
}

/**
 * Get collections by type
 */
export function getCollectionsByType(
  collections: Collection[],
  type: CollectionType
): Collection[] {
  return collections.filter(c => c.type === type && !c.deletedAt);
}

/**
 * Get collections by user
 */
export function getCollectionsByUser(
  collections: Collection[],
  userId: string
): Collection[] {
  return collections.filter(c => c.userId === userId && !c.deletedAt);
}

/**
 * Create a favorites collection
 */
export function createFavorite(userId: string): Collection {
  return createCollection({
    userId,
    name: 'Favorites',
    type: 'favorites',
  });
}

/**
 * Create a playlist
 */
export function createPlaylist(userId: string, name: string): Collection {
  return createCollection({
    userId,
    name,
    type: 'playlist',
  });
}

/**
 * Create a watchlist
 */
export function createWatchlist(userId: string): Collection {
  return createCollection({
    userId,
    name: 'Watch Later',
    type: 'watchlist',
  });
}

/**
 * Create a reading list
 */
export function createReadingList(userId: string): Collection {
  return createCollection({
    userId,
    name: 'Reading List',
    type: 'reading_list',
  });
}
