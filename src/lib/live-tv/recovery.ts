/**
 * When a stream that just failed has actually come back.
 *
 * HLS.js answers a fatal network error with `startLoad()`, which reloads the
 * playlist and very often simply works -- a segment 404'd during a discontinuity,
 * the provider hiccupped, the CDN dropped one request. The player then has to
 * decide, a few seconds later, whether that worked or whether the whole thing
 * needs rebuilding.
 *
 * It used to decide by not deciding. The escalation was scheduled unconditionally
 * and its guard only asked whether the component was still mounted and the HLS
 * instance had not been replaced -- both of which are true after a SUCCESSFUL
 * recovery. So every fatal network error tore the player down and rebuilt it five
 * seconds later even when the picture had been back for four of them, and each
 * rebuild is a fresh connection on a provider line that often permits exactly one.
 *
 * The honest question is whether the media clock moved, which is the same evidence
 * the stall watcher already trusts and the only thing that distinguishes a stream
 * that recovered from one that is still broken. It lives here rather than inside
 * the component because the component's own tests are excluded from the suite over
 * HLS.js and mpegts.js mocking, and a decision nothing can test is a decision that
 * drifts.
 */

/** What the media element looked like at two points in time. */
export interface RecoveryCheck {
  /** `video.currentTime` when the error arrived. */
  timeAtError: number;
  /** `video.currentTime` now, after the grace period. */
  timeNow: number;
  /** A paused video is not a failed one -- the reader stopped it. */
  paused: boolean;
  /** Set when another fatal error arrived during the grace period. */
  erroredAgain?: boolean;
}

/**
 * Did playback resume?
 *
 * Deliberately strict about what counts as evidence:
 *
 *   - A clock that has not moved is not a recovery, however healthy everything
 *     else looks. This is the whole test.
 *   - A second fatal error during the grace period overrides a moved clock. A
 *     stream can produce a second of video and fail again, and treating that as
 *     recovered leaves a player that never rebuilds and never reports.
 *   - Paused counts as recovered, because it is not a failure to recover FROM.
 *     Rebuilding the player under a reader who deliberately paused would restart
 *     the stream they stopped, and on a one-connection line that is the worst
 *     available way to respond to a pause.
 *   - Time going BACKWARDS counts as movement. A live stream whose buffer was
 *     rebuilt can legitimately resume at a lower currentTime, and requiring a
 *     forward step would call that a failure and rebuild a working stream.
 */
export function hasRecovered({
  timeAtError,
  timeNow,
  paused,
  erroredAgain = false,
}: RecoveryCheck): boolean {
  if (erroredAgain) return false;
  if (paused) return true;
  return timeNow !== timeAtError;
}

/**
 * How long to wait before the next attempt.
 *
 * Doubling, so a line that is genuinely busy is not hammered: a provider that
 * counts concurrent connections sees one attempt, then one four seconds later,
 * rather than five inside a second. `attempt` is zero-based.
 */
export function retryDelayMs(attempt: number, baseMs: number): number {
  return baseMs * 2 ** Math.max(0, attempt);
}
