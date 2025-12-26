/**
 * IPTV Proxy Module
 * 
 * Proxies HTTP streams to avoid mixed content errors on HTTPS pages
 */

export {
  // Types
  type ProxyConfig,
  type ProxyRequest,
  type StreamInfo,
  type ParsedProxyUrl,
  type CreateProxyUrlOptions,
  
  // URL Protocol Detection
  isHttpUrl,
  isHttpsUrl,
  
  // Proxy Decision
  shouldProxy,
  
  // Proxy URL Creation
  createProxyUrl,
  parseProxyUrl,
  
  // Stream URL Validation
  validateStreamUrl,
  
  // Headers
  getStreamHeaders,
  buildProxyHeaders,
  
  // URL Sanitization
  sanitizeUrl,
  
  // URL Encoding/Decoding
  encodeStreamUrl,
  decodeStreamUrl,
} from './iptv-proxy';
