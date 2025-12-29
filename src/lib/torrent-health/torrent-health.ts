/**
 * Torrent Health Utilities
 *
 * Calculates torrent health based on seeders and leechers.
 * Health is displayed as a 1-5 bar indicator (green = healthy, red = unhealthy).
 *
 * Health calculation is based on ABSOLUTE seeder count:
 * - 100+ seeders = 5 bars (excellent - very healthy swarm)
 * - 50-99 seeders = 4 bars (good - healthy swarm)
 * - 20-49 seeders = 3 bars (fair - moderate swarm)
 * - 5-19 seeders = 2 bars (poor - small swarm)
 * - 1-4 seeders = 1 bar (very poor - barely alive)
 * - 0 seeders = 0 bars (dead torrent)
 *
 * This approach prioritizes absolute availability over ratio because:
 * - A torrent with 700 seeders and 700 leechers is still very healthy
 * - High seeder counts mean fast downloads regardless of leecher count
 * - Users care about download speed, not competition metrics
 */

/**
 * Calculate the number of health bars (0-5) based on seeders
 *
 * @param seeders - Number of seeders (peers with complete copies), null if unknown
 * @param leechers - Number of leechers (peers downloading), null if unknown (kept for API compatibility)
 * @returns Number of health bars (0-5)
 */
export function calculateHealthBars(seeders: number | null, leechers: number | null): number {
  // Unknown swarm data = 0 bars
  if (seeders === null || leechers === null) {
    return 0;
  }

  // No seeders = dead torrent
  if (seeders === 0) {
    return 0;
  }

  // Map absolute seeder count to bars:
  // >= 100 seeders: 5 bars (excellent - very healthy swarm)
  // >= 50 seeders: 4 bars (good - healthy swarm)
  // >= 20 seeders: 3 bars (fair - moderate swarm)
  // >= 5 seeders: 2 bars (poor - small swarm)
  // >= 1 seeder: 1 bar (very poor - barely alive)
  if (seeders >= 100) {
    return 5;
  }
  if (seeders >= 50) {
    return 4;
  }
  if (seeders >= 20) {
    return 3;
  }
  if (seeders >= 5) {
    return 2;
  }
  return 1;
}

/**
 * Get the CSS color classes for each health bar
 *
 * @param bars - Number of active bars (0-5)
 * @returns Array of 5 CSS color classes
 */
export function getHealthBarColors(bars: number): string[] {
  const inactiveColor = 'bg-bg-tertiary';

  // Color scheme based on health level
  const colorsByBars: Record<number, string> = {
    0: inactiveColor,
    1: 'bg-error',      // Red - very unhealthy
    2: 'bg-warning',    // Orange - poor
    3: 'bg-yellow-500', // Yellow - fair
    4: 'bg-lime-500',   // Light green - good
    5: 'bg-success',    // Green - excellent
  };

  const activeColor = colorsByBars[bars] ?? inactiveColor;

  return Array.from({ length: 5 }, (_, i) =>
    i < bars ? activeColor : inactiveColor
  );
}
