/**
 * Watch Party Store Tests
 *
 * Tests for the in-memory party storage
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getParty,
  setParty,
  deleteParty,
  hasParty,
  getAllPartyCodes,
  getPartyCount,
  cleanupOldParties,
  pruneStaleMembers,
  touchMember,
  addPartyChat,
  readPartyChat,
  MEMBER_STALE_MS,
} from './_store';
import type { WatchParty } from '@/lib/watch-party';

// Helper to create a valid mock party
function createMockParty(code: string, createdAt?: Date): WatchParty {
  return {
    id: `party-${code}`,
    code,
    hostId: 'host-1',
    hostName: 'TestHost',
    mediaUrl: '',
    mediaTitle: 'Watch Party',
    state: 'waiting',
    members: [{ id: 'host-1', name: 'TestHost', isHost: true, joinedAt: new Date() }],
    playback: { currentTime: 0, isPlaying: false, duration: 0, lastUpdate: Date.now() },
    settings: { maxMembers: 50, chatEnabled: true, allowGuestControl: false },
    createdAt: createdAt ?? new Date(),
  };
}

describe('Watch Party Store', () => {
  beforeEach(() => {
    // Clear all parties before each test
    const codes = getAllPartyCodes();
    codes.forEach(code => deleteParty(code));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setParty', () => {
    it('should store a party', () => {
      const party = createMockParty('ABC123');
      setParty('ABC123', party);

      expect(hasParty('ABC123')).toBe(true);
    });

    it('should overwrite existing party with same code', async () => {
      const party1 = createMockParty('ABC123');
      party1.hostName = 'Host1';
      setParty('ABC123', party1);

      const party2 = createMockParty('ABC123');
      party2.hostName = 'Host2';
      setParty('ABC123', party2);

      const retrieved = await getParty('ABC123');
      expect(retrieved?.hostName).toBe('Host2');
    });
  });

  describe('getParty', () => {
    it('should return party when it exists', async () => {
      const party = createMockParty('ABC123');
      setParty('ABC123', party);

      const retrieved = await getParty('ABC123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.code).toBe('ABC123');
    });

    it('should return undefined when party does not exist', async () => {
      const retrieved = await getParty('NONEXISTENT');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('members who stop polling', () => {
    const withMembers = (code = 'ABC123'): WatchParty => ({
      ...createMockParty(code),
      members: [
        { id: 'host-1', name: 'Host', isHost: true, joinedAt: new Date() },
        { id: 'm1', name: 'Ann', isHost: false, joinedAt: new Date() },
        { id: 'm2', name: 'Bob', isHost: false, joinedAt: new Date() },
      ],
    });

    it('drops a member who has not polled for 30 seconds, and never the host', () => {
      const party = withMembers();
      const t0 = 1_000_000;
      touchMember('ABC123', 'm1', t0);
      touchMember('ABC123', 'm2', t0);
      touchMember('ABC123', 'm1', t0 + 25_000);
      const pruned = pruneStaleMembers(party, t0 + MEMBER_STALE_MS + 1);
      expect(pruned.members.map((m) => m.id)).toEqual(['host-1', 'm1']);
    });

    it('gives a member it has never heard from a full interval (a restart empties nobody)', () => {
      const party = withMembers('FRESH1');
      const t0 = 2_000_000;
      expect(pruneStaleMembers(party, t0)).toBe(party);
      expect(pruneStaleMembers(party, t0 + MEMBER_STALE_MS).members).toHaveLength(3);
      expect(pruneStaleMembers(party, t0 + MEMBER_STALE_MS + 1).members.map((m) => m.id)).toEqual(['host-1']);
    });
  });

  describe("the party's own chat", () => {
    it('keeps lines in order and returns only what is new after a time', async () => {
      const a = await addPartyChat('CHAT01', 'Ann', 'hi');
      const b = await addPartyChat('CHAT01', 'Bob', 'hello');
      expect(b.createdAt > a.createdAt).toBe(true); // strictly later, even in the same millisecond
      expect((await readPartyChat('CHAT01')).map((l) => l.body)).toEqual(['hi', 'hello']);
      expect((await readPartyChat('CHAT01', a.createdAt)).map((l) => l.body)).toEqual(['hello']);
      expect(await readPartyChat('CHAT01', b.createdAt)).toEqual([]);
      expect(await readPartyChat('OTHER1')).toEqual([]);
    });

    it('keeps the last 200 lines', async () => {
      for (let i = 0; i < 205; i++) await addPartyChat('CHAT02', 'Ann', `line ${i}`);
      const lines = await readPartyChat('CHAT02');
      expect(lines).toHaveLength(200);
      expect(lines[0]?.body).toBe('line 5');
    });
  });

  describe('deleteParty', () => {
    it('should delete existing party and return true', () => {
      const party = createMockParty('ABC123');
      setParty('ABC123', party);

      const result = deleteParty('ABC123');
      expect(result).toBe(true);
      expect(hasParty('ABC123')).toBe(false);
    });

    it('should return false when party does not exist', () => {
      const result = deleteParty('NONEXISTENT');
      expect(result).toBe(false);
    });
  });

  describe('hasParty', () => {
    it('should return true when party exists', () => {
      const party = createMockParty('ABC123');
      setParty('ABC123', party);

      expect(hasParty('ABC123')).toBe(true);
    });

    it('should return false when party does not exist', () => {
      expect(hasParty('NONEXISTENT')).toBe(false);
    });
  });

  describe('getAllPartyCodes', () => {
    it('should return empty array when no parties', () => {
      const codes = getAllPartyCodes();
      expect(codes).toEqual([]);
    });

    it('should return all party codes', () => {
      setParty('ABC123', createMockParty('ABC123'));
      setParty('DEF456', createMockParty('DEF456'));
      setParty('GHI789', createMockParty('GHI789'));

      const codes = getAllPartyCodes();
      expect(codes).toHaveLength(3);
      expect(codes).toContain('ABC123');
      expect(codes).toContain('DEF456');
      expect(codes).toContain('GHI789');
    });
  });

  describe('getPartyCount', () => {
    it('should return 0 when no parties', () => {
      expect(getPartyCount()).toBe(0);
    });

    it('should return correct count', () => {
      setParty('ABC123', createMockParty('ABC123'));
      setParty('DEF456', createMockParty('DEF456'));

      expect(getPartyCount()).toBe(2);
    });

    it('should update count after deletion', () => {
      setParty('ABC123', createMockParty('ABC123'));
      setParty('DEF456', createMockParty('DEF456'));
      deleteParty('ABC123');

      expect(getPartyCount()).toBe(1);
    });
  });

  describe('cleanupOldParties', () => {
    it('should not delete recent parties', () => {
      const party = createMockParty('ABC123', new Date());
      setParty('ABC123', party);

      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(0);
      expect(hasParty('ABC123')).toBe(true);
    });

    it('should delete parties older than 24 hours', () => {
      // Create a party from 25 hours ago
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const oldParty = createMockParty('OLD123', oldDate);
      setParty('OLD123', oldParty);

      // Create a recent party
      const newParty = createMockParty('NEW123', new Date());
      setParty('NEW123', newParty);

      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(1);
      expect(hasParty('OLD123')).toBe(false);
      expect(hasParty('NEW123')).toBe(true);
    });

    it('should delete multiple old parties', () => {
      // Create old parties
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      setParty('OLD1', createMockParty('OLD1', oldDate));
      setParty('OLD2', createMockParty('OLD2', oldDate));
      setParty('OLD3', createMockParty('OLD3', oldDate));

      // Create a recent party
      setParty('NEW1', createMockParty('NEW1', new Date()));

      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(3);
      expect(getPartyCount()).toBe(1);
    });

    it('should return 0 when no parties to clean', () => {
      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(0);
    });

    it('should handle party exactly at 24 hour boundary', () => {
      // Create a party 23 hours and 59 minutes ago (should NOT be deleted)
      // We use 23h59m instead of exactly 24h to avoid timing issues in tests
      const almostOldDate = new Date(Date.now() - (23 * 60 * 60 * 1000 + 59 * 60 * 1000));
      setParty('EXACT', createMockParty('EXACT', almostOldDate));

      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(0);
      expect(hasParty('EXACT')).toBe(true);
    });

    it('should handle party just over 24 hours', () => {
      // Create a party 24 hours + 1 second ago (should be deleted)
      const justOverDate = new Date(Date.now() - (24 * 60 * 60 * 1000 + 1000));
      setParty('JUSTOVER', createMockParty('JUSTOVER', justOverDate));

      const cleaned = cleanupOldParties();
      expect(cleaned).toBe(1);
      expect(hasParty('JUSTOVER')).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple set operations', () => {
      for (let i = 0; i < 100; i++) {
        const code = `CODE${i.toString().padStart(3, '0')}`;
        setParty(code, createMockParty(code));
      }

      expect(getPartyCount()).toBe(100);
    });

    it('should handle set and delete interleaved', () => {
      setParty('A', createMockParty('A'));
      setParty('B', createMockParty('B'));
      deleteParty('A');
      setParty('C', createMockParty('C'));
      deleteParty('B');
      setParty('D', createMockParty('D'));

      expect(getPartyCount()).toBe(2);
      expect(hasParty('A')).toBe(false);
      expect(hasParty('B')).toBe(false);
      expect(hasParty('C')).toBe(true);
      expect(hasParty('D')).toBe(true);
    });
  });
});
