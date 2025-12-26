/**
 * Watch Party Tests
 * 
 * TDD tests for synchronized streaming with SSE chat
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePartyCode,
  validatePartyCode,
  createWatchParty,
  joinWatchParty,
  leaveWatchParty,
  getPartyState,
  updatePlaybackState,
  syncPlayback,
  createChatMessage,
  validateChatMessage,
  formatChatMessage,
  getPartyMembers,
  isPartyHost,
  canControlPlayback,
  calculateSyncOffset,
  shouldResync,
  PartyState,
  PlaybackState,
  ChatMessage,
  PartyMember,
  WatchParty,
} from './watch-party';

describe('Watch Party', () => {
  describe('Party Code Generation', () => {
    it('should generate a valid party code', () => {
      const code = generatePartyCode();
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBe(6);
    });

    it('should generate uppercase alphanumeric codes', () => {
      const code = generatePartyCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generatePartyCode());
      }
      // Should have high uniqueness (allow some collisions in 100 tries)
      expect(codes.size).toBeGreaterThan(95);
    });

    it('should validate correct party codes', () => {
      expect(validatePartyCode('ABC123')).toBe(true);
      expect(validatePartyCode('XYZ789')).toBe(true);
      expect(validatePartyCode('A1B2C3')).toBe(true);
    });

    it('should reject invalid party codes', () => {
      expect(validatePartyCode('')).toBe(false);
      expect(validatePartyCode('abc123')).toBe(false); // lowercase
      expect(validatePartyCode('ABC12')).toBe(false); // too short
      expect(validatePartyCode('ABC1234')).toBe(false); // too long
      expect(validatePartyCode('ABC-12')).toBe(false); // special chars
    });
  });

  describe('Watch Party Creation', () => {
    it('should create a watch party with required fields', () => {
      const party = createWatchParty({
        hostId: 'user-123',
        hostName: 'John',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      expect(party.id).toBeDefined();
      expect(party.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(party.hostId).toBe('user-123');
      expect(party.hostName).toBe('John');
      expect(party.mediaUrl).toBe('https://example.com/video.mp4');
      expect(party.mediaTitle).toBe('Test Video');
      expect(party.createdAt).toBeInstanceOf(Date);
      expect(party.state).toBe('waiting');
    });

    it('should initialize with empty members list containing host', () => {
      const party = createWatchParty({
        hostId: 'user-123',
        hostName: 'John',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      expect(party.members).toHaveLength(1);
      expect(party.members[0].id).toBe('user-123');
      expect(party.members[0].name).toBe('John');
      expect(party.members[0].isHost).toBe(true);
    });

    it('should initialize playback state', () => {
      const party = createWatchParty({
        hostId: 'user-123',
        hostName: 'John',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      expect(party.playback).toBeDefined();
      expect(party.playback.isPlaying).toBe(false);
      expect(party.playback.currentTime).toBe(0);
      expect(party.playback.duration).toBe(0);
    });
  });

  describe('Join/Leave Party', () => {
    let party: WatchParty;

    beforeEach(() => {
      party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });
    });

    it('should allow users to join a party', () => {
      const updatedParty = joinWatchParty(party, {
        userId: 'user-456',
        userName: 'Guest',
      });

      expect(updatedParty.members).toHaveLength(2);
      expect(updatedParty.members[1].id).toBe('user-456');
      expect(updatedParty.members[1].name).toBe('Guest');
      expect(updatedParty.members[1].isHost).toBe(false);
    });

    it('should not allow duplicate joins', () => {
      const firstJoin = joinWatchParty(party, {
        userId: 'user-456',
        userName: 'Guest',
      });

      const secondJoin = joinWatchParty(firstJoin, {
        userId: 'user-456',
        userName: 'Guest',
      });

      expect(secondJoin.members).toHaveLength(2);
    });

    it('should allow users to leave a party', () => {
      const withGuest = joinWatchParty(party, {
        userId: 'user-456',
        userName: 'Guest',
      });

      const afterLeave = leaveWatchParty(withGuest, 'user-456');

      expect(afterLeave.members).toHaveLength(1);
      expect(afterLeave.members[0].id).toBe('host-123');
    });

    it('should end party when host leaves', () => {
      const afterHostLeave = leaveWatchParty(party, 'host-123');

      expect(afterHostLeave.state).toBe('ended');
    });

    it('should track join time for members', () => {
      const updatedParty = joinWatchParty(party, {
        userId: 'user-456',
        userName: 'Guest',
      });

      expect(updatedParty.members[1].joinedAt).toBeInstanceOf(Date);
    });
  });

  describe('Party State Management', () => {
    let party: WatchParty;

    beforeEach(() => {
      party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });
    });

    it('should get current party state', () => {
      const state = getPartyState(party);

      expect(state.partyId).toBe(party.id);
      expect(state.code).toBe(party.code);
      expect(state.memberCount).toBe(1);
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
    });

    it('should update playback state', () => {
      const updated = updatePlaybackState(party, {
        isPlaying: true,
        currentTime: 30.5,
        duration: 120,
      });

      expect(updated.playback.isPlaying).toBe(true);
      expect(updated.playback.currentTime).toBe(30.5);
      expect(updated.playback.duration).toBe(120);
    });

    it('should track last update timestamp', () => {
      const before = Date.now();
      const updated = updatePlaybackState(party, {
        isPlaying: true,
        currentTime: 30.5,
      });
      const after = Date.now();

      expect(updated.playback.lastUpdate).toBeGreaterThanOrEqual(before);
      expect(updated.playback.lastUpdate).toBeLessThanOrEqual(after);
    });
  });

  describe('Playback Synchronization', () => {
    it('should calculate sync offset between host and client', () => {
      const hostTime = 30.0;
      const clientTime = 28.5;
      const offset = calculateSyncOffset(hostTime, clientTime);

      expect(offset).toBe(1.5);
    });

    it('should handle negative offsets', () => {
      const hostTime = 30.0;
      const clientTime = 32.0;
      const offset = calculateSyncOffset(hostTime, clientTime);

      expect(offset).toBe(-2.0);
    });

    it('should determine when resync is needed', () => {
      // More than 2 seconds off should trigger resync
      expect(shouldResync(2.5)).toBe(true);
      expect(shouldResync(-3.0)).toBe(true);
      
      // Less than 2 seconds is acceptable
      expect(shouldResync(1.5)).toBe(false);
      expect(shouldResync(-1.0)).toBe(false);
      expect(shouldResync(0)).toBe(false);
    });

    it('should generate sync command', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const updatedParty = updatePlaybackState(party, {
        isPlaying: true,
        currentTime: 45.0,
        duration: 120,
      });

      const syncCommand = syncPlayback(updatedParty, 42.0);

      expect(syncCommand.action).toBe('seek');
      expect(syncCommand.targetTime).toBe(45.0);
      expect(syncCommand.isPlaying).toBe(true);
    });

    it('should not sync if within threshold', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const updatedParty = updatePlaybackState(party, {
        isPlaying: true,
        currentTime: 45.0,
        duration: 120,
      });

      const syncCommand = syncPlayback(updatedParty, 44.5);

      expect(syncCommand.action).toBe('none');
    });
  });

  describe('Chat Messages', () => {
    it('should create a chat message', () => {
      const message = createChatMessage({
        partyId: 'party-123',
        userId: 'user-456',
        userName: 'John',
        content: 'Hello everyone!',
      });

      expect(message.id).toBeDefined();
      expect(message.partyId).toBe('party-123');
      expect(message.userId).toBe('user-456');
      expect(message.userName).toBe('John');
      expect(message.content).toBe('Hello everyone!');
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.type).toBe('message');
    });

    it('should create system messages', () => {
      const message = createChatMessage({
        partyId: 'party-123',
        userId: 'system',
        userName: 'System',
        content: 'John joined the party',
        type: 'system',
      });

      expect(message.type).toBe('system');
    });

    it('should validate message content', () => {
      expect(validateChatMessage('Hello!')).toBe(true);
      expect(validateChatMessage('A'.repeat(500))).toBe(true);
      
      expect(validateChatMessage('')).toBe(false);
      expect(validateChatMessage('   ')).toBe(false);
      expect(validateChatMessage('A'.repeat(1001))).toBe(false);
    });

    it('should sanitize message content', () => {
      const message = createChatMessage({
        partyId: 'party-123',
        userId: 'user-456',
        userName: 'John',
        content: '  Hello <script>alert("xss")</script>  ',
      });

      expect(message.content).not.toContain('<script>');
      expect(message.content).not.toContain('</script>');
    });

    it('should format chat message for display', () => {
      const message = createChatMessage({
        partyId: 'party-123',
        userId: 'user-456',
        userName: 'John',
        content: 'Hello everyone!',
      });

      const formatted = formatChatMessage(message);

      expect(formatted).toContain('John');
      expect(formatted).toContain('Hello everyone!');
    });
  });

  describe('Party Members', () => {
    let party: WatchParty;

    beforeEach(() => {
      party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      party = joinWatchParty(party, { userId: 'user-1', userName: 'Alice' });
      party = joinWatchParty(party, { userId: 'user-2', userName: 'Bob' });
    });

    it('should get all party members', () => {
      const members = getPartyMembers(party);

      expect(members).toHaveLength(3);
      expect(members.map(m => m.name)).toContain('Host');
      expect(members.map(m => m.name)).toContain('Alice');
      expect(members.map(m => m.name)).toContain('Bob');
    });

    it('should identify party host', () => {
      expect(isPartyHost(party, 'host-123')).toBe(true);
      expect(isPartyHost(party, 'user-1')).toBe(false);
      expect(isPartyHost(party, 'user-2')).toBe(false);
    });

    it('should check playback control permissions', () => {
      // Host can always control
      expect(canControlPlayback(party, 'host-123')).toBe(true);
      
      // Guests cannot control by default
      expect(canControlPlayback(party, 'user-1')).toBe(false);
    });

    it('should allow guests to control when enabled', () => {
      const partyWithGuestControl: WatchParty = {
        ...party,
        settings: {
          ...party.settings,
          allowGuestControl: true,
        },
      };

      expect(canControlPlayback(partyWithGuestControl, 'user-1')).toBe(true);
    });
  });

  describe('Party Settings', () => {
    it('should create party with default settings', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      expect(party.settings).toBeDefined();
      expect(party.settings.allowGuestControl).toBe(false);
      expect(party.settings.maxMembers).toBe(50);
      expect(party.settings.chatEnabled).toBe(true);
    });

    it('should create party with custom settings', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
        settings: {
          allowGuestControl: true,
          maxMembers: 10,
          chatEnabled: false,
        },
      });

      expect(party.settings.allowGuestControl).toBe(true);
      expect(party.settings.maxMembers).toBe(10);
      expect(party.settings.chatEnabled).toBe(false);
    });

    it('should enforce max members limit', () => {
      let party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
        settings: { maxMembers: 3 },
      });

      party = joinWatchParty(party, { userId: 'user-1', userName: 'Alice' });
      party = joinWatchParty(party, { userId: 'user-2', userName: 'Bob' });
      
      // Third guest should not be added (host + 2 guests = 3)
      const result = joinWatchParty(party, { userId: 'user-3', userName: 'Charlie' });
      
      expect(result.members).toHaveLength(3);
    });
  });

  describe('SSE Event Formatting', () => {
    it('should format playback update event', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const state = getPartyState(party);
      
      expect(state).toHaveProperty('partyId');
      expect(state).toHaveProperty('isPlaying');
      expect(state).toHaveProperty('currentTime');
    });

    it('should include all necessary sync data', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const updated = updatePlaybackState(party, {
        isPlaying: true,
        currentTime: 60.0,
        duration: 300,
      });

      const state = getPartyState(updated);

      expect(state.isPlaying).toBe(true);
      expect(state.currentTime).toBe(60.0);
      expect(state.duration).toBe(300);
      expect(state.lastUpdate).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle party with no media duration', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const state = getPartyState(party);
      expect(state.duration).toBe(0);
    });

    it('should handle rapid playback updates', () => {
      let party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      // Simulate rapid updates
      for (let i = 0; i < 100; i++) {
        party = updatePlaybackState(party, {
          currentTime: i * 0.1,
          isPlaying: true,
        });
      }

      expect(party.playback.currentTime).toBe(9.9);
    });

    it('should handle empty party code validation', () => {
      expect(validatePartyCode(null as unknown as string)).toBe(false);
      expect(validatePartyCode(undefined as unknown as string)).toBe(false);
    });

    it('should handle leaving non-existent member', () => {
      const party = createWatchParty({
        hostId: 'host-123',
        hostName: 'Host',
        mediaUrl: 'https://example.com/video.mp4',
        mediaTitle: 'Test Video',
      });

      const result = leaveWatchParty(party, 'non-existent');
      
      expect(result.members).toHaveLength(1);
    });
  });
});
