/**
 * Torrent Health Tests
 *
 * Tests for calculating torrent health based on seeders and leechers
 * Health is displayed as a 1-5 bar indicator (green = healthy, red = unhealthy)
 *
 * Health calculation considers both:
 * 1. Absolute seeder count (high seeders = healthy regardless of ratio)
 * 2. Seeder to leecher ratio (for lower seeder counts)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthBars,
  getHealthBarColors,
} from './torrent-health';

describe('Torrent Health', () => {
  describe('calculateHealthBars', () => {
    // Null/unknown data tests
    it('should return 0 bars for null seeders', () => {
      expect(calculateHealthBars(null, 10)).toBe(0);
    });

    it('should return 0 bars for null leechers', () => {
      expect(calculateHealthBars(10, null)).toBe(0);
    });

    it('should return 0 bars for both null', () => {
      expect(calculateHealthBars(null, null)).toBe(0);
    });

    it('should return 0 bars for 0 seeders', () => {
      expect(calculateHealthBars(0, 10)).toBe(0);
    });

    // Absolute seeder count tests (high seeders = healthy)
    it('should return 5 bars for 500+ seeders regardless of leechers', () => {
      // 500 seeders is excellent health regardless of leecher count
      expect(calculateHealthBars(500, 0)).toBe(5);
      expect(calculateHealthBars(500, 100)).toBe(5);
      expect(calculateHealthBars(500, 500)).toBe(5);
      expect(calculateHealthBars(500, 1000)).toBe(5);
      expect(calculateHealthBars(700, 700)).toBe(5);
      expect(calculateHealthBars(1000, 2000)).toBe(5);
    });

    it('should return 5 bars for 100+ seeders regardless of leechers', () => {
      // 100+ seeders is excellent health
      expect(calculateHealthBars(100, 0)).toBe(5);
      expect(calculateHealthBars(100, 50)).toBe(5);
      expect(calculateHealthBars(100, 100)).toBe(5);
      expect(calculateHealthBars(100, 200)).toBe(5);
      expect(calculateHealthBars(150, 300)).toBe(5);
    });

    it('should return 4 bars for 50-99 seeders regardless of leechers', () => {
      // 50-99 seeders is good health
      expect(calculateHealthBars(50, 0)).toBe(4);
      expect(calculateHealthBars(50, 50)).toBe(4);
      expect(calculateHealthBars(50, 100)).toBe(4);
      expect(calculateHealthBars(75, 150)).toBe(4);
      expect(calculateHealthBars(99, 200)).toBe(4);
    });

    it('should return 3 bars for 20-49 seeders regardless of leechers', () => {
      // 20-49 seeders is fair health
      expect(calculateHealthBars(20, 0)).toBe(3);
      expect(calculateHealthBars(20, 20)).toBe(3);
      expect(calculateHealthBars(20, 50)).toBe(3);
      expect(calculateHealthBars(35, 100)).toBe(3);
      expect(calculateHealthBars(49, 200)).toBe(3);
    });

    it('should return 2 bars for 5-19 seeders regardless of leechers', () => {
      // 5-19 seeders is poor health
      expect(calculateHealthBars(5, 0)).toBe(2);
      expect(calculateHealthBars(5, 5)).toBe(2);
      expect(calculateHealthBars(10, 20)).toBe(2);
      expect(calculateHealthBars(15, 50)).toBe(2);
      expect(calculateHealthBars(19, 100)).toBe(2);
    });

    it('should return 1 bar for 1-4 seeders regardless of leechers', () => {
      // 1-4 seeders is very poor health
      expect(calculateHealthBars(1, 0)).toBe(1);
      expect(calculateHealthBars(1, 5)).toBe(1);
      expect(calculateHealthBars(2, 10)).toBe(1);
      expect(calculateHealthBars(3, 20)).toBe(1);
      expect(calculateHealthBars(4, 50)).toBe(1);
    });

    // Edge cases
    it('should handle boundary values correctly', () => {
      // Exact boundaries
      expect(calculateHealthBars(100, 0)).toBe(5); // >= 100
      expect(calculateHealthBars(99, 0)).toBe(4);  // < 100, >= 50
      expect(calculateHealthBars(50, 0)).toBe(4);  // >= 50
      expect(calculateHealthBars(49, 0)).toBe(3);  // < 50, >= 20
      expect(calculateHealthBars(20, 0)).toBe(3);  // >= 20
      expect(calculateHealthBars(19, 0)).toBe(2);  // < 20, >= 5
      expect(calculateHealthBars(5, 0)).toBe(2);   // >= 5
      expect(calculateHealthBars(4, 0)).toBe(1);   // < 5, >= 1
      expect(calculateHealthBars(1, 0)).toBe(1);   // >= 1
    });
  });

  describe('getHealthBarColors', () => {
    it('should return all gray for 0 bars', () => {
      const colors = getHealthBarColors(0);
      expect(colors).toHaveLength(5);
      expect(colors.every(c => c === 'bg-bg-tertiary')).toBe(true);
    });

    it('should return 1 red bar for 1 bar health', () => {
      const colors = getHealthBarColors(1);
      expect(colors[0]).toBe('bg-error');
      expect(colors.slice(1).every(c => c === 'bg-bg-tertiary')).toBe(true);
    });

    it('should return 2 orange bars for 2 bar health', () => {
      const colors = getHealthBarColors(2);
      expect(colors[0]).toBe('bg-warning');
      expect(colors[1]).toBe('bg-warning');
      expect(colors.slice(2).every(c => c === 'bg-bg-tertiary')).toBe(true);
    });

    it('should return 3 yellow bars for 3 bar health', () => {
      const colors = getHealthBarColors(3);
      expect(colors[0]).toBe('bg-yellow-500');
      expect(colors[1]).toBe('bg-yellow-500');
      expect(colors[2]).toBe('bg-yellow-500');
      expect(colors.slice(3).every(c => c === 'bg-bg-tertiary')).toBe(true);
    });

    it('should return 4 light green bars for 4 bar health', () => {
      const colors = getHealthBarColors(4);
      expect(colors[0]).toBe('bg-lime-500');
      expect(colors[1]).toBe('bg-lime-500');
      expect(colors[2]).toBe('bg-lime-500');
      expect(colors[3]).toBe('bg-lime-500');
      expect(colors[4]).toBe('bg-bg-tertiary');
    });

    it('should return 5 green bars for 5 bar health', () => {
      const colors = getHealthBarColors(5);
      expect(colors.every(c => c === 'bg-success')).toBe(true);
    });
  });
});
