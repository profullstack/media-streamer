/**
 * Tests for TV Detection Hook
 *
 * Tests the detection of TV browsers (Amazon Silk, Fire TV, etc.)
 * to apply TV-specific layouts and styling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTvDetection, isTvBrowser, detectTvFromUserAgent, type TvDetectionResult } from './use-tv-detection';

describe('isTvBrowser', () => {
  it('should detect Amazon Silk browser', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 5.1.1; KFAUWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/91.3.1 like Chrome/91.0.4472.88 Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Fire TV devices (AFT prefix)', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 9; AFTSSS) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Kindle Fire devices (KF prefix)', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 5.1.1; KFGIWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/91.3.1 like Chrome/91.0.4472.88 Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Android TV', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 9; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Google TV', () => {
    const userAgent = 'Mozilla/5.0 (Linux; GoogleTV 4.2.2; LG Google TV) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.77 Safari/534.24';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Samsung Smart TV (Tizen)', () => {
    const userAgent = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect LG WebOS TV', () => {
    const userAgent = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Roku TV', () => {
    const userAgent = 'Roku/DVP-9.10 (519.10E04111A)';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Apple TV', () => {
    const userAgent = 'AppleTV11,1/11.1';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should detect Chromecast', () => {
    const userAgent = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.225 Safari/537.36 CrKey/1.56.500000';
    expect(isTvBrowser(userAgent)).toBe(true);
  });

  it('should NOT detect regular Chrome desktop browser', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(false);
  });

  it('should NOT detect Safari on macOS', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15';
    expect(isTvBrowser(userAgent)).toBe(false);
  });

  it('should NOT detect Chrome on Android phone', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36';
    expect(isTvBrowser(userAgent)).toBe(false);
  });

  it('should NOT detect Safari on iPhone', () => {
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1';
    expect(isTvBrowser(userAgent)).toBe(false);
  });

  it('should NOT detect Firefox on desktop', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0';
    expect(isTvBrowser(userAgent)).toBe(false);
  });

  it('should handle empty user agent', () => {
    expect(isTvBrowser('')).toBe(false);
  });

  it('should handle undefined user agent', () => {
    expect(isTvBrowser(undefined as unknown as string)).toBe(false);
  });
});

describe('detectTvFromUserAgent', () => {
  it('should detect Amazon Silk browser from user agent header', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 5.1.1; KFAUWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/91.3.1 like Chrome/91.0.4472.88 Safari/537.36';
    const result = detectTvFromUserAgent(userAgent);

    expect(result.isTv).toBe(true);
    expect(result.isLoading).toBe(false);
    expect(result.browserType).toBe('silk');
  });

  it('should return isTv: false for null user agent', () => {
    const result = detectTvFromUserAgent(null);

    expect(result.isTv).toBe(false);
    expect(result.isLoading).toBe(false);
    expect(result.browserType).toBeNull();
  });

  it('should return isTv: false for undefined user agent', () => {
    const result = detectTvFromUserAgent(undefined);

    expect(result.isTv).toBe(false);
    expect(result.isLoading).toBe(false);
    expect(result.browserType).toBeNull();
  });

  it('should return isTv: false for desktop browser user agent', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    const result = detectTvFromUserAgent(userAgent);

    expect(result.isTv).toBe(false);
    expect(result.isLoading).toBe(false);
    expect(result.browserType).toBeNull();
  });
});

describe('useTvDetection', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('should detect TV browser and return isTv: true', () => {
    const silkUserAgent = 'Mozilla/5.0 (Linux; Android 5.1.1; KFAUWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/91.3.1 like Chrome/91.0.4472.88 Safari/537.36';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: silkUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.browserType).toBe('silk');
  });

  it('should detect Fire TV and return correct browserType', () => {
    const fireTvUserAgent = 'Mozilla/5.0 (Linux; Android 9; AFTSSS) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: fireTvUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(true);
    expect(result.current.browserType).toBe('firetv');
  });

  it('should detect Android TV and return correct browserType', () => {
    const androidTvUserAgent = 'Mozilla/5.0 (Linux; Android 9; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: androidTvUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(true);
    expect(result.current.browserType).toBe('androidtv');
  });

  it('should detect Samsung Tizen TV and return correct browserType', () => {
    const tizenUserAgent = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: tizenUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(true);
    expect(result.current.browserType).toBe('tizen');
  });

  it('should detect LG WebOS TV and return correct browserType', () => {
    const webosUserAgent = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: webosUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(true);
    expect(result.current.browserType).toBe('webos');
  });

  it('should return isTv: false for desktop browser', () => {
    const desktopUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: desktopUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.browserType).toBeNull();
  });

  it('should return isTv: false for mobile browser', () => {
    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1';

    Object.defineProperty(global, 'navigator', {
      value: { userAgent: mobileUserAgent },
      writable: true,
    });

    const { result } = renderHook(() => useTvDetection());

    expect(result.current.isTv).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.browserType).toBeNull();
  });
});
