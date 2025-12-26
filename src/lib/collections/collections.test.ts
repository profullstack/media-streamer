/**
 * Collections Module Tests
 * 
 * TDD tests for user collections (favorites, playlists, watchlists, reading lists)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
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
  Collection,
  CollectionItem,
  CollectionType,
  MediaType,
} from './collections';

describe('Collections Module', () => {
  describe('Collection Creation', () => {
    it('should create a collection', () => {
      const collection = createCollection({
        userId: 'user-123',
        name: 'My Favorites',
        type: 'favorites',
        description: 'My favorite content',
      });

      expect(collection.id).toBeDefined();
      expect(collection.userId).toBe('user-123');
      expect(collection.name).toBe('My Favorites');
      expect(collection.type).toBe('favorites');
      expect(collection.description).toBe('My favorite content');
      expect(collection.items).toEqual([]);
      expect(collection.createdAt).toBeInstanceOf(Date);
      expect(collection.isPublic).toBe(false);
    });

    it('should create a public collection', () => {
      const collection = createCollection({
        userId: 'user-123',
        name: 'Public Playlist',
        type: 'playlist',
        isPublic: true,
      });

      expect(collection.isPublic).toBe(true);
    });

    it('should create favorites collection', () => {
      const collection = createFavorite('user-123');

      expect(collection.type).toBe('favorites');
      expect(collection.name).toBe('Favorites');
    });

    it('should create playlist', () => {
      const collection = createPlaylist('user-123', 'My Music');

      expect(collection.type).toBe('playlist');
      expect(collection.name).toBe('My Music');
    });

    it('should create watchlist', () => {
      const collection = createWatchlist('user-123');

      expect(collection.type).toBe('watchlist');
      expect(collection.name).toBe('Watch Later');
    });

    it('should create reading list', () => {
      const collection = createReadingList('user-123');

      expect(collection.type).toBe('reading_list');
      expect(collection.name).toBe('Reading List');
    });
  });

  describe('Collection Validation', () => {
    it('should validate correct collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      expect(validateCollection(collection)).toBe(true);
    });

    it('should reject collection without user ID', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: '',
        name: 'My Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      expect(validateCollection(collection)).toBe(false);
    });

    it('should reject collection without name', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: '',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      expect(validateCollection(collection)).toBe(false);
    });
  });

  describe('Collection Items', () => {
    it('should add item to collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const updated = addItemToCollection(collection, {
        mediaId: 'media-123',
        mediaType: 'video',
        title: 'My Video',
        thumbnail: 'https://example.com/thumb.jpg',
      });

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].mediaId).toBe('media-123');
      expect(updated.items[0].mediaType).toBe('video');
      expect(updated.items[0].addedAt).toBeInstanceOf(Date);
    });

    it('should not add duplicate items', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [
          {
            id: 'item-1',
            mediaId: 'media-123',
            mediaType: 'video',
            title: 'My Video',
            addedAt: new Date(),
            position: 0,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const updated = addItemToCollection(collection, {
        mediaId: 'media-123',
        mediaType: 'video',
        title: 'My Video',
      });

      expect(updated.items).toHaveLength(1); // Still 1
    });

    it('should remove item from collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [
          {
            id: 'item-1',
            mediaId: 'media-123',
            mediaType: 'video',
            title: 'My Video',
            addedAt: new Date(),
            position: 0,
          },
          {
            id: 'item-2',
            mediaId: 'media-456',
            mediaType: 'audio',
            title: 'My Audio',
            addedAt: new Date(),
            position: 1,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const updated = removeItemFromCollection(collection, 'item-1');

      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].id).toBe('item-2');
    });

    it('should get collection items', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [
          {
            id: 'item-1',
            mediaId: 'media-123',
            mediaType: 'video',
            title: 'My Video',
            addedAt: new Date(),
            position: 0,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const items = getCollectionItems(collection);

      expect(items).toHaveLength(1);
    });

    it('should check if item is in collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [
          {
            id: 'item-1',
            mediaId: 'media-123',
            mediaType: 'video',
            title: 'My Video',
            addedAt: new Date(),
            position: 0,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      expect(isItemInCollection(collection, 'media-123')).toBe(true);
      expect(isItemInCollection(collection, 'media-999')).toBe(false);
    });
  });

  describe('Item Reordering', () => {
    it('should reorder collection items', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'playlist',
        items: [
          { id: 'item-1', mediaId: 'media-1', mediaType: 'audio', title: 'Song 1', addedAt: new Date(), position: 0 },
          { id: 'item-2', mediaId: 'media-2', mediaType: 'audio', title: 'Song 2', addedAt: new Date(), position: 1 },
          { id: 'item-3', mediaId: 'media-3', mediaType: 'audio', title: 'Song 3', addedAt: new Date(), position: 2 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const updated = reorderCollectionItems(collection, ['item-3', 'item-1', 'item-2']);

      expect(updated.items[0].id).toBe('item-3');
      expect(updated.items[0].position).toBe(0);
      expect(updated.items[1].id).toBe('item-1');
      expect(updated.items[1].position).toBe(1);
      expect(updated.items[2].id).toBe('item-2');
      expect(updated.items[2].position).toBe(2);
    });
  });

  describe('Collection Updates', () => {
    it('should update collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const updated = updateCollection(collection, {
        name: 'Updated Name',
        description: 'New description',
        isPublic: true,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New description');
      expect(updated.isPublic).toBe(true);
    });
  });

  describe('Collection Deletion', () => {
    it('should mark collection as deleted', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      const deleted = deleteCollection(collection);

      expect(deleted.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('Collection Queries', () => {
    it('should get collections by type', () => {
      const collections: Collection[] = [
        {
          id: 'col-1',
          userId: 'user-123',
          name: 'Favorites',
          type: 'favorites',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublic: false,
        },
        {
          id: 'col-2',
          userId: 'user-123',
          name: 'Playlist 1',
          type: 'playlist',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublic: false,
        },
        {
          id: 'col-3',
          userId: 'user-123',
          name: 'Playlist 2',
          type: 'playlist',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublic: false,
        },
      ];

      const playlists = getCollectionsByType(collections, 'playlist');

      expect(playlists).toHaveLength(2);
    });

    it('should get collections by user', () => {
      const collections: Collection[] = [
        {
          id: 'col-1',
          userId: 'user-123',
          name: 'Favorites',
          type: 'favorites',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublic: false,
        },
        {
          id: 'col-2',
          userId: 'user-456',
          name: 'Other Favorites',
          type: 'favorites',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublic: false,
        },
      ];

      const userCollections = getCollectionsByUser(collections, 'user-123');

      expect(userCollections).toHaveLength(1);
      expect(userCollections[0].userId).toBe('user-123');
    });
  });

  describe('Collection Types', () => {
    it('should have correct collection type values', () => {
      const types: CollectionType[] = ['favorites', 'playlist', 'watchlist', 'reading_list'];
      
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Media Types', () => {
    it('should have correct media type values', () => {
      const types: MediaType[] = ['video', 'audio', 'ebook', 'torrent'];
      
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty collection', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'Empty Collection',
        type: 'favorites',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      expect(getCollectionItems(collection)).toEqual([]);
      expect(isItemInCollection(collection, 'any-id')).toBe(false);
    });

    it('should handle reorder with missing items', () => {
      const collection: Collection = {
        id: 'col-123',
        userId: 'user-123',
        name: 'My Collection',
        type: 'playlist',
        items: [
          { id: 'item-1', mediaId: 'media-1', mediaType: 'audio', title: 'Song 1', addedAt: new Date(), position: 0 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
      };

      // Reorder with non-existent item
      const updated = reorderCollectionItems(collection, ['item-999', 'item-1']);

      // Should only include existing items
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].id).toBe('item-1');
    });
  });
});
