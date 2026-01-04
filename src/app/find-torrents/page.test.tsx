import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindTorrentsPage from './page';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('FindTorrentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should render the search form', () => {
    render(<FindTorrentsPage />);

    expect(screen.getByRole('heading', { name: /find torrents to add/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search for torrents/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('should display sort options', () => {
    render(<FindTorrentsPage />);

    expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /seeders/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /size/i })).toBeInTheDocument();
  });

  it('should show validation error for short query', async () => {
    const user = userEvent.setup();
    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'ab');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    expect(screen.getByText(/query must be at least 3 characters/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should perform search and display results', async () => {
    const user = userEvent.setup();
    const mockResults = {
      query: 'ubuntu',
      results: [
        {
          provider: 'thepiratebay',
          results: [
            {
              name: 'Ubuntu 24.04 LTS',
              magnet: 'magnet:?xt=urn:btih:abc123',
              size: '4.5 GB',
              seeders: 1500,
              leechers: 200,
              date: '2024-04-25',
            },
          ],
        },
      ],
      totalResults: 1,
      timestamp: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'ubuntu');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText('Ubuntu 24.04 LTS')).toBeInTheDocument();
    });

    expect(screen.getByText('4.5 GB')).toBeInTheDocument();
    // Check for seeders - the component formats large numbers
    expect(screen.getByText('1.5k')).toBeInTheDocument(); // 1500 formatted as 1.5k
    expect(screen.getByText('200')).toBeInTheDocument(); // leechers
  });

  it('should display error message on search failure', async () => {
    const user = userEvent.setup();
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Search failed' }),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test query');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/search failed/i)).toBeInTheDocument();
    });
  });

  it('should display "no results" message when search returns empty', async () => {
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

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'nonexistent');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });

  it('should have "Add Magnet" button for each result', async () => {
    const user = userEvent.setup();
    const mockResults = {
      query: 'test',
      results: [
        {
          provider: 'thepiratebay',
          results: [
            {
              name: 'Test Torrent',
              magnet: 'magnet:?xt=urn:btih:abc123',
              size: '1 GB',
              seeders: 100,
              leechers: 50,
            },
          ],
        },
      ],
      totalResults: 1,
      timestamp: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add magnet/i })).toBeInTheDocument();
    });
  });

  it('should open add magnet modal with prefilled URL when clicking "Add Magnet" button', async () => {
    const user = userEvent.setup();
    const mockResults = {
      query: 'test',
      results: [
        {
          provider: 'thepiratebay',
          results: [
            {
              name: 'Test Torrent',
              magnet: 'magnet:?xt=urn:btih:abc123',
              size: '1 GB',
              seeders: 100,
              leechers: 50,
            },
          ],
        },
      ],
      totalResults: 1,
      timestamp: new Date().toISOString(),
    };

    // First call for search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add magnet/i })).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add magnet/i });
    await user.click(addButton);

    // Modal should be open with the magnet URL prefilled
    await waitFor(() => {
      expect(screen.getByText('Add Magnet Link')).toBeInTheDocument();
    });

    // Check that the magnet URL is prefilled in the modal
    const magnetInput = screen.getByLabelText(/magnet url/i);
    expect(magnetInput).toHaveValue('magnet:?xt=urn:btih:abc123');
  });

  it('should close modal when close button is clicked', async () => {
    const user = userEvent.setup();
    const mockResults = {
      query: 'test',
      results: [
        {
          provider: 'thepiratebay',
          results: [
            {
              name: 'Test Torrent',
              magnet: 'magnet:?xt=urn:btih:abc123',
              size: '1 GB',
              seeders: 100,
              leechers: 50,
            },
          ],
        },
      ],
      totalResults: 1,
      timestamp: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test');
    
    const searchButton = screen.getByRole('button', { name: /search/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add magnet/i })).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add magnet/i });
    await user.click(addButton);

    // Modal should be open
    await waitFor(() => {
      expect(screen.getByText('Add Magnet Link')).toBeInTheDocument();
    });

    // Close the modal
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByText('Add Magnet Link')).not.toBeInTheDocument();
    });
  });

  it('should group results by provider', async () => {
    const user = userEvent.setup();
    const mockResults = {
      query: 'test',
      results: [
        {
          provider: 'thepiratebay',
          results: [
            { name: 'TPB Result', magnet: 'magnet:?xt=urn:btih:1', size: '1 GB', seeders: 100, leechers: 50 },
          ],
        },
        {
          provider: 'nyaa',
          results: [
            { name: 'Nyaa Result', magnet: 'magnet:?xt=urn:btih:2', size: '2 GB', seeders: 200, leechers: 100 },
          ],
        },
      ],
      totalResults: 2,
      timestamp: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test');
    
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

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ query: 'test', results: [], totalResults: 0, timestamp: '' }),
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

  it('should submit search on Enter key press', async () => {
    const user = userEvent.setup();
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ query: 'test', results: [], totalResults: 0, timestamp: '' }),
    });

    render(<FindTorrentsPage />);

    const input = screen.getByPlaceholderText(/search for torrents/i);
    await user.type(input, 'test query{enter}');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
