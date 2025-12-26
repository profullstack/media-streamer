/**
 * IPTV Module
 * 
 * M3U playlist parsing and EPG management
 */

export {
  // Types
  type M3UChannel,
  type M3UPlaylist,
  type EPGSource,
  type ChannelGroup,
  type ParsedExtInf,
  type M3UParseResult,
  type CreatePlaylistOptions,
  type GenerateM3UOptions,
  type FilterOptions,
  
  // M3U Parsing
  parseM3U,
  parseM3ULine,
  parseExtInf,
  parseAttributes,
  validateM3UContent,
  
  // M3U Generation
  generateM3U,
  
  // EPG URL Handling
  parseEPGUrl,
  validateEPGUrl,
  
  // Playlist Management
  createPlaylist,
  addChannel,
  removeChannel,
  updateChannel,
  
  // Channel Operations
  getChannelsByGroup,
  searchChannels,
  sortChannels,
  filterChannels,
  
  // Playlist Operations
  mergePlaylist,
  exportPlaylist,
} from './iptv';
