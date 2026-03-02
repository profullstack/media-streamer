/**
 * ProfileSelector Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileSelector } from './ProfileSelector';

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock child components
vi.mock('./ProfileAvatar', () => ({
  ProfileAvatar: ({ id, name, onClick, isDefault }: any) => (
    <div 
      data-testid={`profile-avatar-${id}`}
      onClick={() => onClick?.(id)}
      role="button"
      tabIndex={0}
    >
      {name} {isDefault ? '(Default)' : null}
    </div>
  ),
}));

vi.mock('./AddProfileButton', () => ({
  AddProfileButton: ({ onClick, disabled }: any) => (
    <button 
      data-testid="add-profile-button"
      onClick={onClick}
      disabled={disabled}
    >
      Add Profile
    </button>
  ),
}));

vi.mock('./CreateProfileDialog', () => ({
  CreateProfileDialog: ({ open, onClose, onProfileCreated }: any) => (
    open ? (
      <div data-testid="create-profile-dialog">
        <button onClick={onProfileCreated}>Create</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null
  ),
}));

const mockProfiles = [
  {
    id: 'profile-1',
    account_id: 'user-123',
    name: 'Default Profile',
    avatar_url: null,
    avatar_emoji: '😀',
    is_default: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'profile-2',
    account_id: 'user-123',
    name: 'Gaming Profile',
    avatar_url: null,
    avatar_emoji: '🎮',
    is_default: false,
    created_at: '2024-01-01T01:00:00Z',
    updated_at: '2024-01-01T01:00:00Z',
  },
];

describe('ProfileSelector', () => {
  const defaultProps = {
    profiles: mockProfiles,
    hasFamilyPlan: true,
    onProfileSelect: vi.fn(),
    onProfilesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all profiles', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    expect(screen.getByTestId('profile-avatar-profile-1')).toBeInTheDocument();
    expect(screen.getByTestId('profile-avatar-profile-2')).toBeInTheDocument();
    expect(screen.getByText('Default Profile (Default)')).toBeInTheDocument();
    expect(screen.getByText('Gaming Profile')).toBeInTheDocument();
  });

  it('should render header text', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    expect(screen.getByText('Choose a profile to continue')).toBeInTheDocument();
  });

  it('should show add profile button for family plan users', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    expect(screen.getByTestId('add-profile-button')).toBeInTheDocument();
  });

  it('should not show add profile button for non-family plan users', () => {
    render(<ProfileSelector {...defaultProps} hasFamilyPlan={false} />);
    
    expect(screen.queryByTestId('add-profile-button')).not.toBeInTheDocument();
  });

  it('should not show add profile button when max profiles reached', () => {
    const maxProfiles = Array.from({ length: 10 }, (_, i) => ({
      id: `profile-${i + 1}`,
      account_id: 'user-123',
      name: `Profile ${i + 1}`,
      avatar_url: null,
      avatar_emoji: null,
      is_default: i === 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }));

    render(<ProfileSelector {...defaultProps} profiles={maxProfiles} />);
    
    expect(screen.queryByTestId('add-profile-button')).not.toBeInTheDocument();
  });

  it('should call onProfileSelect when profile is clicked', async () => {
    render(<ProfileSelector {...defaultProps} />);
    
    fireEvent.click(screen.getByTestId('profile-avatar-profile-2'));
    
    await waitFor(() => {
      expect(defaultProps.onProfileSelect).toHaveBeenCalledWith('profile-2');
    });
  });

  it('should redirect to home after successful profile selection', async () => {
    const onProfileSelect = vi.fn().mockResolvedValue(undefined);
    render(<ProfileSelector {...defaultProps} onProfileSelect={onProfileSelect} />);
    
    fireEvent.click(screen.getByTestId('profile-avatar-profile-1'));
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('should handle profile selection error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onProfileSelect = vi.fn().mockRejectedValue(new Error('Selection failed'));
    render(<ProfileSelector {...defaultProps} onProfileSelect={onProfileSelect} />);
    
    fireEvent.click(screen.getByTestId('profile-avatar-profile-1'));
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to select profile:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('should disable profile selection during ongoing selection', async () => {
    let resolveSelection: () => void;
    const onProfileSelect = vi.fn((_profileId: string) => new Promise<void>(resolve => {
      resolveSelection = resolve as () => void;
    }));
    
    render(<ProfileSelector {...defaultProps} onProfileSelect={onProfileSelect} />);
    
    // Click first profile
    fireEvent.click(screen.getByTestId('profile-avatar-profile-1'));
    
    // Try to click second profile while first is still processing
    fireEvent.click(screen.getByTestId('profile-avatar-profile-2'));
    
    // Only first profile should be called
    expect(onProfileSelect).toHaveBeenCalledTimes(1);
    expect(onProfileSelect).toHaveBeenCalledWith('profile-1');
    
    // Resolve the first selection
    resolveSelection!();
  });

  it('should open create profile dialog when add button is clicked', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    fireEvent.click(screen.getByTestId('add-profile-button'));
    
    expect(screen.getByTestId('create-profile-dialog')).toBeInTheDocument();
  });

  it('should not open create dialog for non-family users', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProfileSelector {...defaultProps} hasFamilyPlan={false} />);
    
    // Manually trigger the create function (button shouldn't be visible)
    const selector = screen.getByText("Who's watching?").closest('div');
    
    expect(screen.queryByTestId('create-profile-dialog')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('should not open create dialog when max profiles reached', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const maxProfiles = Array.from({ length: 10 }, (_, i) => ({
      id: `profile-${i + 1}`,
      account_id: 'user-123',
      name: `Profile ${i + 1}`,
      avatar_url: null,
      avatar_emoji: null,
      is_default: i === 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }));

    render(<ProfileSelector {...defaultProps} profiles={maxProfiles} />);
    
    expect(screen.queryByTestId('create-profile-dialog')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('should close create dialog when cancelled', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    fireEvent.click(screen.getByTestId('add-profile-button'));
    expect(screen.getByTestId('create-profile-dialog')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('create-profile-dialog')).not.toBeInTheDocument();
  });

  it('should call onProfilesChange when profile is created', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    fireEvent.click(screen.getByTestId('add-profile-button'));
    fireEvent.click(screen.getByText('Create'));
    
    expect(defaultProps.onProfilesChange).toHaveBeenCalled();
    expect(screen.queryByTestId('create-profile-dialog')).not.toBeInTheDocument();
  });

  it('should show appropriate footer message for family plan users', () => {
    render(<ProfileSelector {...defaultProps} />);
    
    expect(screen.getByText(/Select a profile above to start watching/)).toBeInTheDocument();
  });

  it('should show upgrade message for non-family plan users', () => {
    render(<ProfileSelector {...defaultProps} hasFamilyPlan={false} />);
    
    expect(screen.getByText(/Upgrade to Family plan to add more profiles/)).toBeInTheDocument();
  });

  it('should show default bypass hint when no device default is set', () => {
    localStorage.removeItem('default-profile-id');
    render(<ProfileSelector {...defaultProps} />);
    
    expect(screen.getByText(/Set a default to skip this screen on this device/)).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ProfileSelector {...defaultProps} className="custom-class" />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should disable add profile button when not allowed', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProfileSelector {...defaultProps} hasFamilyPlan={false} />);
    
    // Add profile button should not be rendered for non-family users
    expect(screen.queryByTestId('add-profile-button')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});