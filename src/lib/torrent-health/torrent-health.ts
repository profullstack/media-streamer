/**
 * Torrent Health Utilities
 *
 * Calculates torrent health based on seeders and leechers.
 * Health is displayed as a 1-5 bar indicator (green = healthy, red = unhealthy).
 *
 * Health calculation:
 * - More seeders = healthier (faster downloads)
 * - Seeder to leecher ratio matters (high ratio = less competition)
 * - 0 seeders = dead torrent (0 bars)
 */

/**
 * Calculate the number of health bars (0-5) based on seeders and leechers
 *
 * @param seeders - Number of seeders (peers with complete copies), null if unknown
 * @param leechers - Number of leechers (peers downloading), null if unknown
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

  // Calculate seeder to leecher ratio
  // If no leechers, ratio is effectively infinite (very healthy)
  const ratio = leechers === 0 ? seeders : seeders / leechers;

  // Map ratio to bars:
  // ratio >= 5: 5 bars (excellent - many seeders per leecher)
  // ratio >= 2: 4 bars (good)
  // ratio >= 1: 3 bars (fair - equal seeders and leechers)
  // ratio >= 0.5: 2 bars (poor - more leechers than seeders)
  // ratio > 0: 1 bar (very poor - few seeders)
  if (ratio >= 5) {
    return 5;
  }
  if (ratio >= 2) {
    return 4;
  }
  if (ratio >= 1) {
    return 3;
  }
  if (ratio >= 0.5) {
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
