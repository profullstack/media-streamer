/**
 * Xtream Codes Module
 * 
 * Integration with Xtream Codes API for IPTV providers
 */

export {
  // Types
  type XtreamStreamType,
  type XtreamCredentials,
  type XtreamProvider,
  type XtreamCategory,
  type XtreamLiveStream,
  type XtreamVodStream,
  type XtreamSeries,
  type XtreamEPGEntry,
  type CreateProviderOptions,
  type ParseResponseResult,
  
  // Provider Management
  createXtreamProvider,
  validateXtreamCredentials,
  
  // URL Building
  buildXtreamUrl,
  buildLiveStreamUrl,
  buildVodStreamUrl,
  buildSeriesStreamUrl,
  
  // Response Parsing
  parseXtreamResponse,
  
  // Category Parsing
  getXtreamCategories,
  
  // Stream Parsing
  getXtreamLiveStreams,
  getXtreamVodStreams,
  getXtreamSeries,
  
  // EPG Parsing
  getXtreamEPG,
  
  // Channel Formatting
  formatXtreamChannel,
} from './xtream';
