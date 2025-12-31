/**
 * useAnalytics Hook Tests
 * 
 * Tests for client-side analytics tracking hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalytics } from './use-analytics';

describe('useAnalytics', () => {
  let mockDatafast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDatafast = vi.fn();
    // Mock window.datafast
    Object.defineProperty(window, 'datafast', {
      value: mockDatafast,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up the mock - datafast is a configurable property we added
    delete (window as { datafast?: unknown }).datafast;
  });

  it('should return analytics tracking functions', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.trackEvent).toBeDefined();
    expect(result.current.trackCheckout).toBeDefined();
    expect(result.current.trackSearch).toBeDefined();
    expect(result.current.trackPlayback).toBeDefined();
    expect(result.current.trackDownload).toBeDefined();
    expect(result.current.trackSignup).toBeDefined();
    expect(result.current.trackLogin).toBeDefined();
    expect(result.current.trackSubscription).toBeDefined();
    expect(result.current.trackWatchParty).toBeDefined();
  });

  it('should track checkout events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackCheckout({
        email: 'test@example.com',
        product_id: 'prod_123',
        name: 'Test User',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('initiate_checkout', {
      email: 'test@example.com',
      product_id: 'prod_123',
      name: 'Test User',
    });
  });

  it('should track search events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackSearch({
        query: 'test query',
        results_count: 10,
        category: 'music',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('search', {
      query: 'test query',
      results_count: 10,
      category: 'music',
    });
  });

  it('should track playback events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackPlayback({
        action: 'start',
        media_type: 'video',
        title: 'Test Video',
        infohash: 'abc123',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('playback', {
      action: 'start',
      media_type: 'video',
      title: 'Test Video',
      infohash: 'abc123',
    });
  });

  it('should track download events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackDownload({
        action: 'start',
        infohash: 'abc123',
        title: 'Test Download',
        size: 1024000,
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('download', {
      action: 'start',
      infohash: 'abc123',
      title: 'Test Download',
      size: 1024000,
    });
  });

  it('should track signup events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackSignup({
        method: 'email',
        email: 'newuser@example.com',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('signup', {
      method: 'email',
      email: 'newuser@example.com',
    });
  });

  it('should track login events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackLogin({
        method: 'email',
        email: 'user@example.com',
        success: true,
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('login', {
      method: 'email',
      email: 'user@example.com',
      success: true,
    });
  });

  it('should track subscription events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackSubscription({
        action: 'create',
        plan: 'premium',
        amount: 9.99,
        currency: 'USD',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('subscription', {
      action: 'create',
      plan: 'premium',
      amount: 9.99,
      currency: 'USD',
    });
  });

  it('should track watch party events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackWatchParty({
        action: 'create',
        party_id: 'party_123',
        media_title: 'Test Movie',
      });
    });

    expect(mockDatafast).toHaveBeenCalledWith('watch_party', {
      action: 'create',
      party_id: 'party_123',
      media_title: 'Test Movie',
    });
  });

  it('should track generic events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackEvent('click', { button: 'play', page: 'home' });
    });

    expect(mockDatafast).toHaveBeenCalledWith('click', {
      button: 'play',
      page: 'home',
    });
  });

  it('should not throw when datafast is undefined', () => {
    // Remove datafast mock - datafast is a configurable property we added
    delete (window as { datafast?: unknown }).datafast;

    const { result } = renderHook(() => useAnalytics());

    expect(() => {
      act(() => {
        result.current.trackEvent('click', { test: true });
      });
    }).not.toThrow();
  });

  it('should memoize tracking functions', () => {
    const { result, rerender } = renderHook(() => useAnalytics());

    const firstTrackEvent = result.current.trackEvent;
    const firstTrackCheckout = result.current.trackCheckout;

    rerender();

    expect(result.current.trackEvent).toBe(firstTrackEvent);
    expect(result.current.trackCheckout).toBe(firstTrackCheckout);
  });
});
