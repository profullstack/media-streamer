/**
 * Tests for TV Layout Provider
 *
 * Tests that the TvLayoutProvider correctly applies the 'tv' class
 * to the html element when a TV browser is detected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TvLayoutProvider } from './tv-layout-provider';

// Mock the useTvDetection hook
vi.mock('@/hooks', () => ({
  useTvDetection: vi.fn(),
}));

import { useTvDetection } from '@/hooks';

const mockUseTvDetection = vi.mocked(useTvDetection);

describe('TvLayoutProvider', () => {
  beforeEach(() => {
    // Reset mocks and clean up html classes before each test
    vi.resetAllMocks();
    document.documentElement.classList.remove('tv');
    document.documentElement.className = '';
  });

  afterEach(() => {
    // Clean up html classes after each test
    document.documentElement.classList.remove('tv');
    const tvClasses = Array.from(document.documentElement.classList).filter((cls) =>
      cls.startsWith('tv-')
    );
    tvClasses.forEach((cls) => document.documentElement.classList.remove(cls));
  });

  it('should render children', () => {
    mockUseTvDetection.mockReturnValue({
      isTv: false,
      isLoading: false,
      browserType: null,
    });

    render(
      <TvLayoutProvider>
        <div data-testid="child">Test Child</div>
      </TvLayoutProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('should add "tv" class to html element when TV browser is detected', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: true,
      isLoading: false,
      browserType: 'silk',
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(true);
    });
  });

  it('should add browser-specific class when TV browser type is detected', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: true,
      isLoading: false,
      browserType: 'silk',
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(true);
      expect(document.documentElement.classList.contains('tv-silk')).toBe(true);
    });
  });

  it('should add "tv-firetv" class for Fire TV browser', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: true,
      isLoading: false,
      browserType: 'firetv',
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(true);
      expect(document.documentElement.classList.contains('tv-firetv')).toBe(true);
    });
  });

  it('should add "tv-androidtv" class for Android TV browser', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: true,
      isLoading: false,
      browserType: 'androidtv',
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(true);
      expect(document.documentElement.classList.contains('tv-androidtv')).toBe(true);
    });
  });

  it('should NOT add "tv" class when not a TV browser', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: false,
      isLoading: false,
      browserType: null,
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    // Wait a tick to ensure useEffect has run
    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(false);
    });
  });

  it('should remove "tv" class when component unmounts', async () => {
    mockUseTvDetection.mockReturnValue({
      isTv: true,
      isLoading: false,
      browserType: 'silk',
    });

    const { unmount } = render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('tv')).toBe(true);
    });

    unmount();

    expect(document.documentElement.classList.contains('tv')).toBe(false);
    expect(document.documentElement.classList.contains('tv-silk')).toBe(false);
  });

  it('should handle loading state without adding classes', () => {
    mockUseTvDetection.mockReturnValue({
      isTv: false,
      isLoading: true,
      browserType: null,
    });

    render(
      <TvLayoutProvider>
        <div>Content</div>
      </TvLayoutProvider>
    );

    // During loading, no TV class should be added
    expect(document.documentElement.classList.contains('tv')).toBe(false);
  });
});
