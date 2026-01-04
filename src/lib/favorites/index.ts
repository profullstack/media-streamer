/**
 * Favorites Module
 *
 * Server-side service for managing user favorites:
 * - Torrent favorites
 * - IPTV channel favorites
 */

export {
  FavoritesService,
  getFavoritesService,
  createFavoritesService,
  type TorrentFavoriteWithDetails,
  type IptvChannelFavoriteWithDetails,
  type AddIptvChannelFavoriteInput,
  type AllFavorites,
} from './favorites';
