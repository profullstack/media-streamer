/**
 * Finance — per-user and global daily caps on AI report generation (PRD §3.3, §8).
 *
 * Caps are enforced over a rolling 24h window against the success rows in
 * `finance_report_runs`. The count source is injectable so the policy is unit
 * testable without a database.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface RateLimitConfig {
  perUserPerDay: number;
  globalPerDay: number;
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    perUserPerDay: envInt('FINANCE_REPORTS_PER_USER_PER_DAY', 10),
    globalPerDay: envInt('FINANCE_REPORTS_GLOBAL_PER_DAY', 200),
  };
}

export interface RateLimitDecision {
  allowed: boolean;
  scope?: 'user' | 'global';
  reason?: string;
}

/**
 * Pure policy: given current counts and config, decide whether another
 * generation is allowed.
 */
export function evaluateRateLimit(
  counts: { user: number; global: number },
  config: RateLimitConfig,
): RateLimitDecision {
  if (counts.global >= config.globalPerDay) {
    return {
      allowed: false,
      scope: 'global',
      reason: 'Daily analysis capacity reached across all users. Please try again later.',
    };
  }
  if (counts.user >= config.perUserPerDay) {
    return {
      allowed: false,
      scope: 'user',
      reason: `You have reached your daily limit of ${config.perUserPerDay} analyses. Please try again tomorrow.`,
    };
  }
  return { allowed: true };
}

/** ISO timestamp 24h ago (rolling window start). */
export function rollingWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
