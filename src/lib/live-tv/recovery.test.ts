import { describe, expect, it } from 'vitest';
import { hasRecovered, retryDelayMs } from './recovery';

/**
 * The decision that used to be made by not making it.
 *
 * A fatal HLS network error scheduled a full player rebuild five seconds later
 * whatever happened in between, because the guard only asked whether the
 * component was still mounted -- true after a successful recovery too. So a
 * stream that `startLoad()` had already fixed was torn down and reconnected
 * anyway, and every rebuild is a fresh connection on a line that often permits
 * one.
 */
describe('deciding whether a stream came back', () => {
  it('a clock that moved is a stream that recovered', () => {
    expect(hasRecovered({ timeAtError: 12, timeNow: 16.5, paused: false })).toBe(true);
  });

  it('a clock that has not moved is not, however healthy everything else looks', () => {
    // The whole test. This is the case the old guard could not see.
    expect(hasRecovered({ timeAtError: 12, timeNow: 12, paused: false })).toBe(false);
  });

  it('a second failure overrides a clock that moved', () => {
    /*
     * A stream can produce a second of video and fail again. Reading that as a
     * recovery leaves a player that never rebuilds and never reports, which from
     * the sofa is indistinguishable from a frozen picture.
     */
    expect(
      hasRecovered({ timeAtError: 12, timeNow: 13, paused: false, erroredAgain: true })
    ).toBe(false);
  });

  it('a paused video is recovered, because it is not a failure to recover from', () => {
    /*
     * The reader stopped it. Rebuilding underneath them would restart the stream
     * they deliberately paused -- and on a one-connection line, take the slot to
     * do it.
     */
    expect(hasRecovered({ timeAtError: 12, timeNow: 12, paused: true })).toBe(true);
  });

  it('a clock that went backwards still counts as movement', () => {
    /*
     * A live stream whose buffer was rebuilt can legitimately resume at a lower
     * currentTime. Requiring a forward step would call that a failure and rebuild
     * a stream that is playing.
     */
    expect(hasRecovered({ timeAtError: 30, timeNow: 4, paused: false })).toBe(true);
  });
});

describe('spacing the attempts out', () => {
  it('doubles from the base, so a busy line is not hammered', () => {
    expect(retryDelayMs(0, 2000)).toBe(2000);
    expect(retryDelayMs(1, 2000)).toBe(4000);
    expect(retryDelayMs(2, 2000)).toBe(8000);
    expect(retryDelayMs(4, 2000)).toBe(32000);
  });

  it('treats a negative attempt as the first one rather than shrinking the wait', () => {
    // A guard rather than a feature: a fractional or negative delay would mean
    // reconnecting instantly, which is the one thing the backoff exists to stop.
    expect(retryDelayMs(-3, 2000)).toBe(2000);
  });
});
