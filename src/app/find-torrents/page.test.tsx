/**
 * Find Torrents Page Tests
 *
 * Tests for torrent search functionality including provider alphabetization.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock MainLayout
vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

// Mock icons
vi.mock('@/components/ui/icons', () => ({
  SearchIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="search-icon" data-size={size} className={className}>🔍</span>
  ),
  LoadingSpinner: ({ size }: { size?: number }) => <span data-testid="loading-spinner" data-size={size}>⏳</span>,
  MagnetIcon: ({ size }: { size?: number }) => <span data-testid="magnet-icon" data-size={size}>🧲</span>,
  CheckIcon: ({ size }: { size?: number }) => <span data-testid="check-icon" data-size={size}>✓</span>,
  GlobeIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="globe-icon" data-size={size} className={className}>🌐</span>
  ),
}));

// Mock AddMagnetModal
vi.mock('@/components/torrents/add-magnet-modal', () => ({
  AddMagnetModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="add-magnet-modal">Add Magnet Modal</div> : null
  ),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import FindTorrentsPage from './page';

describe('FindTorrentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Provider Dropdown', () => {
    it('displays providers in alphabetical order with "All Providers" first', () => {
      render(<FindTorrentsPage />);
      
      const providerSelect = screen.getByLabelText(/provider/i);
      const options = within(providerSelect).getAllByRole('option');
      
      // First option should always be "All Providers"
      expect(options[0]).toHaveTextContent('All Providers');
      expect(options[0]).toHaveValue('');
      
      // Remaining options should be in alphabetical order by label
      const providerLabels = options.slice(1).map(opt => opt.textContent);
      const sortedLabels = [...providerLabels].sort((a, b) => 
        (a ?? '').localeCompare(b ?? '')
      );
      
      expect(providerLabels).toEqual(sortedLabels);
    });

    it('includes all expected providers', () => {
      render(<FindTorrentsPage />);
      
      const providerSelect = screen.getByLabelText(/provider/i);
      const options = within(providerSelect).getAllByRole('option');
      const optionTexts = options.map(opt => opt.textContent);
      
      // Check that all expected providers are present
      expect(optionTexts).toContain('All Providers');
      expect(optionTexts).toContain('1337x');
      expect(optionTexts).toContain('LibGen');
      expect(optionTexts).toContain('LimeTorrents');
      expect(optionTexts).toContain('Nyaa');
      expect(optionTexts).toContain('RARBG');
      expect(optionTexts).toContain('The Pirate Bay');
    });

    it('allows selecting a specific provider', async () => {
      const user = userEvent.setup();
      render(<FindTorrentsPage />);
      
      const providerSelect = screen.getByLabelText(/provider/i);
      
      // Select a specific provider
      await user.selectOptions(providerSelect, 'thepiratebay');
      
      expect(providerSelect).toHaveValue('thepiratebay');
    });
  });

  describe('Search Functionality', () => {
    it('should group results by provider', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          query: 'test',
          results: [
            {
              provider: 'thepiratebay',
              results: [
                { name: 'Test Torrent 1', magnet: 'magnet:?xt=1', size: '1GB', seeders: 100, leechers: 10 },
              ],
            },
            {
              provider: 'nyaa',
              results: [
                { name: 'Test Torrent 2', magnet: 'magnet:?xt=2', size: '2GB', seeders: 50, leechers: 5 },
              ],
            },
          ],
          totalResults: 2,
          timestamp: new Date().toISOString(),
        }),
      });
      
      render(<FindTorrentsPage />);
      
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'test');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      await waitFor(() => {
        // Check for provider headers (h2 elements)
        const providerHeaders = screen.getAllByRole('heading', { level: 2 });
        const headerTexts = providerHeaders.map(h => h.textContent?.toLowerCase());
        expect(headerTexts).toContain('thepiratebay');
        expect(headerTexts).toContain('nyaa');
      });
    });

    it('should allow filtering by provider', async () => {
      const user = userEvent.setup();
      render(<FindTorrentsPage />);
      
      // Check that provider filter exists
      const providerSelect = screen.getByLabelText(/provider/i);
      expect(providerSelect).toBeInTheDocument();
      
      // Select a specific provider
      await user.selectOptions(providerSelect, 'thepiratebay');
      
      // Type search query
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'test');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          query: 'test',
          results: [],
          totalResults: 0,
          timestamp: new Date().toISOString(),
        }),
      });
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('provider=thepiratebay'),
          expect.any(Object)
        );
      });
    });

    it('validates minimum query length', async () => {
      const user = userEvent.setup();
      render(<FindTorrentsPage />);
      
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'ab'); // Only 2 characters
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      // Should show validation error
      expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument();
      
      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows loading state during search', async () => {
      const user = userEvent.setup();
      
      // Never-resolving fetch
      mockFetch.mockImplementation(() => new Promise(() => {}));
      
      render(<FindTorrentsPage />);
      
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'test');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      // Should show loading state
      expect(screen.getByText(/searching/i)).toBeInTheDocument();
    });

    it('shows error message on search failure', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Search failed' }),
      });
      
      render(<FindTorrentsPage />);
      
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'test');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      await waitFor(() => {
        expect(screen.getByText(/search failed/i)).toBeInTheDocument();
      });
    });

    it('shows no results message when search returns empty', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          query: 'nonexistent',
          results: [],
          totalResults: 0,
          timestamp: new Date().toISOString(),
        }),
      });
      
      render(<FindTorrentsPage />);
      
      const searchInput = screen.getByPlaceholderText(/search for torrents/i);
      await user.type(searchInput, 'nonexistent');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      await waitFor(() => {
        expect(screen.getByText(/no results found/i)).toBeInTheDocument();
      });
    });
  });
});
