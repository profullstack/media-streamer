/**
 * Torrent Health Tests
 *
 * Tests for calculating torrent health based on seeders and leechers
 * Health is displayed as a 1-5 bar indicator (green = healthy, red = unhealthy)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthBars,
  getHealthBarColors,
} from './torrent-health';

describe('Torrent Health', () => {
  describe('calculateHealthBars', () => {
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

    it('should return 5 bars for high seeder count with 0 leechers', () => {
      expect(calculateHealthBars(50, 0)).toBe(5);
    });

    it('should return 5 bars for very high seeder to leecher ratio', () => {
      // 100 seeders, 10 leechers = ratio of 10
      expect(calculateHealthBars(100, 10)).toBe(5);
    });

    it('should return 3 bars for equal seeders and leechers', () => {
      // 10 seeders, 10 leechers = ratio of 1
      expect(calculateHealthBars(10, 10)).toBe(3);
    });

    it('should return 2 bars for slightly more leechers than seeders', () => {
      // 10 seeders, 15 leechers = ratio of 0.67
      expect(calculateHealthBars(10, 15)).toBe(2);
    });

    it('should return 1 bar for many more leechers than seeders', () => {
      // 5 seeders, 20 leechers = ratio of 0.25
      expect(calculateHealthBars(5, 20)).toBe(1);
    });

    it('should return 1 bar for very few seeders relative to leechers', () => {
      // 1 seeder, 100 leechers = ratio of 0.01
      expect(calculateHealthBars(1, 100)).toBe(1);
    });

    it('should return 4 bars for good seeder count', () => {
      // 20 seeders, 5 leechers = ratio of 4
      expect(calculateHealthBars(20, 5)).toBe(4);
    });

    it('should return 3 bars for 1 seeder 0 leechers (ratio = 1)', () => {
      // When leechers = 0, ratio = seeders = 1, which is >= 1 but < 2
      expect(calculateHealthBars(1, 0)).toBe(3);
    });

    it('should return 5 bars for many seeders 0 leechers', () => {
      // When leechers = 0, ratio = seeders = 10, which is >= 5
      expect(calculateHealthBars(10, 0)).toBe(5);
    });

    it('should return 1 bar for 1 seeder with some leechers', () => {
      expect(calculateHealthBars(1, 5)).toBe(1);
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
