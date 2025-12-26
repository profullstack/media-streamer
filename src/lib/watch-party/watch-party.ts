/**
 * Watch Party Module
 * 
 * Synchronized streaming with SSE chat functionality
 */

import { randomBytes } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Party state enum
 */
export type PartyState = 'waiting' | 'playing' | 'paused' | 'ended';

/**
 * Chat message type
 */
export type ChatMessageType = 'message' | 'system' | 'reaction';

/**
 * Playback state
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  lastUpdate: number;
}

/**
 * Party member
 */
export interface PartyMember {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: Date;
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  partyId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
  type: ChatMessageType;
}

/**
 * Party settings
 */
export interface PartySettings {
  allowGuestControl: boolean;
  maxMembers: number;
  chatEnabled: boolean;
}

/**
 * Watch party
 */
export interface WatchParty {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  mediaUrl: string;
  mediaTitle: string;
  createdAt: Date;
  state: PartyState;
  members: PartyMember[];
  playback: PlaybackState;
  settings: PartySettings;
}

/**
 * Party state summary (for SSE events)
 */
export interface PartyStateSummary {
  partyId: string;
  code: string;
  memberCount: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  lastUpdate: number;
}

/**
 * Sync command
 */
export interface SyncCommand {
  action: 'seek' | 'play' | 'pause' | 'none';
  targetTime: number;
  isPlaying: boolean;
}

/**
 * Create party options
 */
export interface CreatePartyOptions {
  hostId: string;
  hostName: string;
  mediaUrl: string;
  mediaTitle: string;
  settings?: Partial<PartySettings>;
}

/**
 * Join party options
 */
export interface JoinPartyOptions {
  userId: string;
  userName: string;
}

/**
 * Create chat message options
 */
export interface CreateChatMessageOptions {
  partyId: string;
  userId: string;
  userName: string;
  content: string;
  type?: ChatMessageType;
}

/**
 * Update playback options
 */
export interface UpdatePlaybackOptions {
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
}

// ============================================================================
// Constants
// ============================================================================

const PARTY_CODE_LENGTH = 6;
const PARTY_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SYNC_THRESHOLD_SECONDS = 2.0;
const MAX_MESSAGE_LENGTH = 1000;
const DEFAULT_MAX_MEMBERS = 50;

// ============================================================================
// Party Code Functions
// ============================================================================

/**
 * Generate a random party code
 */
export function generatePartyCode(): string {
  const bytes = randomBytes(PARTY_CODE_LENGTH);
  let code = '';
  
  for (let i = 0; i < PARTY_CODE_LENGTH; i++) {
    code += PARTY_CODE_CHARS[bytes[i] % PARTY_CODE_CHARS.length];
  }
  
  return code;
}

/**
 * Validate a party code format
 */
export function validatePartyCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }
  
  return /^[A-Z0-9]{6}$/.test(code);
}

// ============================================================================
// Watch Party Functions
// ============================================================================

/**
 * Create a new watch party
 */
export function createWatchParty(options: CreatePartyOptions): WatchParty {
  const id = randomBytes(16).toString('hex');
  const code = generatePartyCode();
  const now = new Date();
  
  const defaultSettings: PartySettings = {
    allowGuestControl: false,
    maxMembers: DEFAULT_MAX_MEMBERS,
    chatEnabled: true,
  };
  
  const host: PartyMember = {
    id: options.hostId,
    name: options.hostName,
    isHost: true,
    joinedAt: now,
  };
  
  return {
    id,
    code,
    hostId: options.hostId,
    hostName: options.hostName,
    mediaUrl: options.mediaUrl,
    mediaTitle: options.mediaTitle,
    createdAt: now,
    state: 'waiting',
    members: [host],
    playback: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      lastUpdate: Date.now(),
    },
    settings: {
      ...defaultSettings,
      ...options.settings,
    },
  };
}

/**
 * Join a watch party
 */
export function joinWatchParty(party: WatchParty, options: JoinPartyOptions): WatchParty {
  // Check if already a member
  const existingMember = party.members.find(m => m.id === options.userId);
  if (existingMember) {
    return party;
  }
  
  // Check max members
  if (party.members.length >= party.settings.maxMembers) {
    return party;
  }
  
  const newMember: PartyMember = {
    id: options.userId,
    name: options.userName,
    isHost: false,
    joinedAt: new Date(),
  };
  
  return {
    ...party,
    members: [...party.members, newMember],
  };
}

/**
 * Leave a watch party
 */
export function leaveWatchParty(party: WatchParty, userId: string): WatchParty {
  const memberIndex = party.members.findIndex(m => m.id === userId);
  
  if (memberIndex === -1) {
    return party;
  }
  
  const member = party.members[memberIndex];
  
  // If host leaves, end the party
  if (member.isHost) {
    return {
      ...party,
      state: 'ended',
      members: party.members.filter(m => m.id !== userId),
    };
  }
  
  return {
    ...party,
    members: party.members.filter(m => m.id !== userId),
  };
}

/**
 * Get party state summary
 */
export function getPartyState(party: WatchParty): PartyStateSummary {
  return {
    partyId: party.id,
    code: party.code,
    memberCount: party.members.length,
    isPlaying: party.playback.isPlaying,
    currentTime: party.playback.currentTime,
    duration: party.playback.duration,
    lastUpdate: party.playback.lastUpdate,
  };
}

/**
 * Update playback state
 */
export function updatePlaybackState(party: WatchParty, options: UpdatePlaybackOptions): WatchParty {
  return {
    ...party,
    playback: {
      ...party.playback,
      isPlaying: options.isPlaying ?? party.playback.isPlaying,
      currentTime: options.currentTime ?? party.playback.currentTime,
      duration: options.duration ?? party.playback.duration,
      lastUpdate: Date.now(),
    },
  };
}

// ============================================================================
// Synchronization Functions
// ============================================================================

/**
 * Calculate sync offset between host and client
 */
export function calculateSyncOffset(hostTime: number, clientTime: number): number {
  return hostTime - clientTime;
}

/**
 * Determine if resync is needed based on offset
 */
export function shouldResync(offset: number): boolean {
  return Math.abs(offset) > SYNC_THRESHOLD_SECONDS;
}

/**
 * Generate sync command for a client
 */
export function syncPlayback(party: WatchParty, clientTime: number): SyncCommand {
  const offset = calculateSyncOffset(party.playback.currentTime, clientTime);
  
  if (!shouldResync(offset)) {
    return {
      action: 'none',
      targetTime: party.playback.currentTime,
      isPlaying: party.playback.isPlaying,
    };
  }
  
  return {
    action: 'seek',
    targetTime: party.playback.currentTime,
    isPlaying: party.playback.isPlaying,
  };
}

// ============================================================================
// Chat Functions
// ============================================================================

/**
 * Sanitize HTML from message content
 */
function sanitizeContent(content: string): string {
  return content
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Create a chat message
 */
export function createChatMessage(options: CreateChatMessageOptions): ChatMessage {
  const id = randomBytes(16).toString('hex');
  
  return {
    id,
    partyId: options.partyId,
    userId: options.userId,
    userName: options.userName,
    content: sanitizeContent(options.content),
    timestamp: new Date(),
    type: options.type ?? 'message',
  };
}

/**
 * Validate chat message content
 */
export function validateChatMessage(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return false;
  }
  
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return false;
  }
  
  return true;
}

/**
 * Format chat message for display
 */
export function formatChatMessage(message: ChatMessage): string {
  const time = message.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  if (message.type === 'system') {
    return `[${time}] ${message.content}`;
  }
  
  return `[${time}] ${message.userName}: ${message.content}`;
}

// ============================================================================
// Member Functions
// ============================================================================

/**
 * Get all party members
 */
export function getPartyMembers(party: WatchParty): PartyMember[] {
  return [...party.members];
}

/**
 * Check if user is party host
 */
export function isPartyHost(party: WatchParty, userId: string): boolean {
  return party.hostId === userId;
}

/**
 * Check if user can control playback
 */
export function canControlPlayback(party: WatchParty, userId: string): boolean {
  // Host can always control
  if (isPartyHost(party, userId)) {
    return true;
  }
  
  // Check if guest control is enabled
  return party.settings.allowGuestControl;
}
