/**
 * Watch Party Module
 * 
 * Synchronized streaming with SSE chat functionality
 */

export {
  // Types
  type PartyState,
  type ChatMessageType,
  type PlaybackState,
  type PartyMember,
  type ChatMessage,
  type PartySettings,
  type WatchParty,
  type PartyStateSummary,
  type SyncCommand,
  type CreatePartyOptions,
  type JoinPartyOptions,
  type CreateChatMessageOptions,
  type UpdatePlaybackOptions,
  
  // Party Code Functions
  generatePartyCode,
  validatePartyCode,
  
  // Watch Party Functions
  createWatchParty,
  joinWatchParty,
  leaveWatchParty,
  getPartyState,
  updatePlaybackState,
  
  // Synchronization Functions
  calculateSyncOffset,
  shouldResync,
  syncPlayback,
  
  // Chat Functions
  createChatMessage,
  validateChatMessage,
  formatChatMessage,
  
  // Member Functions
  getPartyMembers,
  isPartyHost,
  canControlPlayback,
} from './watch-party';
