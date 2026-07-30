import { describe, it, expect } from 'vitest';

import { describeFetchError, isAbortError, rootCauseCode } from './fetch-error';

/** Build the shape undici actually throws: TypeError('fetch failed') + cause. */
function undiciError(code: string): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ${code}`), { code }) });
}

describe('seedbox fetch-error', () => {
  describe('rootCauseCode', () => {
    it('pulls the code out of undici’s cause chain', () => {
      expect(rootCauseCode(undiciError('ECONNREFUSED'))).toBe('ECONNREFUSED');
    });

    it('walks nested causes to the deepest code', () => {
      const deep = new Error('outer', {
        cause: new Error('middle', { cause: Object.assign(new Error('inner'), { code: 'ENOTFOUND' }) }),
      });
      expect(rootCauseCode(deep)).toBe('ENOTFOUND');
    });

    it('reads codes out of an AggregateError (happy-eyeballs A/AAAA failure)', () => {
      const agg = new AggregateError(
        [Object.assign(new Error('v6'), { code: 'ENETUNREACH' })],
        'all attempts failed'
      );
      expect(rootCauseCode(new TypeError('fetch failed', { cause: agg }))).toBe('ENETUNREACH');
    });

    it('returns null when there is no code anywhere', () => {
      expect(rootCauseCode(new Error('plain'))).toBeNull();
      expect(rootCauseCode('a string')).toBeNull();
    });

    it('does not loop forever on a self-referential cause', () => {
      const loop = new Error('loop') as Error & { cause?: unknown };
      loop.cause = loop;
      expect(rootCauseCode(loop)).toBeNull();
    });
  });

  describe('isAbortError', () => {
    it('recognizes an aborted request', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('does not treat a refused connection as an abort', () => {
      expect(isAbortError(undiciError('ECONNREFUSED'))).toBe(false);
    });
  });

  describe('describeFetchError', () => {
    it('replaces the useless "fetch failed" with the code and a remedy', () => {
      const msg = describeFetchError(undiciError('ECONNREFUSED'));
      expect(msg).not.toBe('fetch failed');
      expect(msg).toContain('ECONNREFUSED');
      expect(msg).toContain('daemon is down');
    });

    it('distinguishes a dead host from a dead daemon', () => {
      const refused = describeFetchError(undiciError('ECONNREFUSED'));
      const dns = describeFetchError(undiciError('ENOTFOUND'));
      expect(refused).not.toBe(dns);
      expect(dns).toContain("doesn't resolve");
    });

    it('reports a timeout as a timeout, not as a transport error', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      expect(describeFetchError(err)).toContain('timed out');
      expect(describeFetchError(err, 'custom timeout text')).toBe('custom timeout text');
    });

    it('keeps an informative message and appends the code', () => {
      const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      expect(describeFetchError(err)).toContain('socket hang up');
      expect(describeFetchError(err)).toContain('ECONNRESET');
    });

    it('falls back to the raw message for an uncoded error', () => {
      expect(describeFetchError(new Error('something odd'))).toBe('something odd');
    });

    it('surfaces an unmapped code rather than swallowing it', () => {
      expect(describeFetchError(undiciError('ESOMETHINGNEW'))).toContain('ESOMETHINGNEW');
    });
  });
});
