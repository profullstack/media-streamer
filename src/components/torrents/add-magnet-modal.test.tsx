import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useTvDetection hook to avoid issues in test environment
vi.mock('@/hooks/use-tv-detection', () => ({
  useTvDetection: () => ({ isTv: false, isLoading: false, browserType: null }),
}));

import { AddMagnetModal } from './add-magnet-modal';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AddMagnetModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should render the modal when isOpen is true', () => {
    render(<AddMagnetModal {...defaultProps} />);

    expect(screen.getByText('Add Magnet Link')).toBeInTheDocument();
    expect(screen.getByLabelText(/magnet url/i)).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    render(<AddMagnetModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Add Magnet Link')).not.toBeInTheDocument();
  });

  it('should prefill the input when initialMagnetUrl is provided', () => {
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';
    render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl} />);

    const input = screen.getByLabelText(/magnet url/i);
    expect(input).toHaveValue(magnetUrl);
  });

  it('should update prefilled value when initialMagnetUrl changes', async () => {
    const magnetUrl1 = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent+1';
    const magnetUrl2 = 'magnet:?xt=urn:btih:def456&dn=Test+Torrent+2';
    
    const { rerender } = render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl1} />);

    const input = screen.getByLabelText(/magnet url/i);
    expect(input).toHaveValue(magnetUrl1);

    rerender(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl2} />);
    
    expect(input).toHaveValue(magnetUrl2);
  });

  it('should clear the input when modal is closed and reopened without initialMagnetUrl', async () => {
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';
    const { rerender } = render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl} />);

    const input = screen.getByLabelText(/magnet url/i);
    expect(input).toHaveValue(magnetUrl);

    // Close the modal
    rerender(<AddMagnetModal {...defaultProps} isOpen={false} initialMagnetUrl={magnetUrl} />);

    // Reopen without initialMagnetUrl
    rerender(<AddMagnetModal {...defaultProps} isOpen={true} />);

    const newInput = screen.getByLabelText(/magnet url/i);
    expect(newInput).toHaveValue('');
  });

  it('should repopulate input when modal is closed and reopened with the same initialMagnetUrl', async () => {
    const user = userEvent.setup();
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';
    const { rerender } = render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl} />);

    const input = screen.getByLabelText(/magnet url/i);
    expect(input).toHaveValue(magnetUrl);

    // User clears the input manually (simulating what happens internally when modal closes)
    await user.clear(input);
    expect(input).toHaveValue('');

    // Close the modal
    rerender(<AddMagnetModal {...defaultProps} isOpen={false} initialMagnetUrl={undefined} />);

    // Reopen with the same magnet URL (simulating clicking Add Magnet on search results again)
    rerender(<AddMagnetModal {...defaultProps} isOpen={true} initialMagnetUrl={magnetUrl} />);

    const newInput = screen.getByLabelText(/magnet url/i);
    expect(newInput).toHaveValue(magnetUrl);
  });

  it('should populate input when modal opens even if initialMagnetUrl was set before isOpen', async () => {
    // This tests the scenario where initialMagnetUrl is set, then isOpen becomes true
    // The useEffect should trigger when isOpen changes to true
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';

    // Start with modal closed but initialMagnetUrl already set
    const { rerender } = render(<AddMagnetModal {...defaultProps} isOpen={false} initialMagnetUrl={magnetUrl} />);

    // Modal is closed, so input shouldn't be visible
    expect(screen.queryByLabelText(/magnet url/i)).not.toBeInTheDocument();

    // Open the modal - the input should be populated with the magnet URL
    rerender(<AddMagnetModal {...defaultProps} isOpen={true} initialMagnetUrl={magnetUrl} />);

    const input = screen.getByLabelText(/magnet url/i);
    expect(input).toHaveValue(magnetUrl);
  });

  it('should have submit button disabled when input is empty', () => {
    render(<AddMagnetModal {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /add torrent/i });
    expect(submitButton).toBeDisabled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should show validation error for invalid magnet URL', async () => {
    const user = userEvent.setup();
    render(<AddMagnetModal {...defaultProps} />);

    const input = screen.getByLabelText(/magnet url/i);
    await user.type(input, 'not-a-magnet-url');

    const submitButton = screen.getByRole('button', { name: /add torrent/i });
    await user.click(submitButton);

    expect(screen.getByText(/invalid magnet url format/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should submit the form with prefilled magnet URL', async () => {
    const user = userEvent.setup();
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';

    // Mock SSE response
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('event: complete\ndata: {"torrentId":"123","infohash":"abc123","name":"Test Torrent","fileCount":1,"totalSize":1000,"isNew":true}\n\n'),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl} />);

    const submitButton = screen.getByRole('button', { name: /add torrent/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/torrents/index', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ magnetUri: magnetUrl }),
      }));
    });
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddMagnetModal {...defaultProps} onClose={onClose} />);

    // The modal has two close buttons - one in the header (aria-label="Close modal") and one in the footer ("Close")
    // Use the footer button which has exact text "Close"
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    const footerCloseButton = closeButtons.find(btn => btn.textContent === 'Close');
    expect(footerCloseButton).toBeDefined();
    await user.click(footerCloseButton!);

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onSuccess when torrent is added successfully', async () => {
    const user = userEvent.setup();
    const magnetUrl = 'magnet:?xt=urn:btih:abc123&dn=Test+Torrent';
    const onSuccess = vi.fn();

    // Mock SSE response
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('event: complete\ndata: {"torrentId":"123","infohash":"abc123","name":"Test Torrent","fileCount":1,"totalSize":1000,"isNew":true}\n\n'),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    render(<AddMagnetModal {...defaultProps} initialMagnetUrl={magnetUrl} onSuccess={onSuccess} />);

    const submitButton = screen.getByRole('button', { name: /add torrent/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        id: '123',
        infohash: 'abc123',
        name: 'Test Torrent',
        totalSize: 1000,
        fileCount: 1,
      });
    });
  });
});
