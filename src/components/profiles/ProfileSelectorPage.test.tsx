import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProfileSelectorPage } from './ProfileSelectorPage';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('./ProfileSelector', () => ({
  ProfileSelector: () => <div data-testid="profile-selector">Profile Selector</div>,
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseRouter = vi.mocked(useRouter);
const mockUseSearchParams = vi.mocked(useSearchParams);

describe('ProfileSelectorPage', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    } as any);

    mockUseSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    } as any);

    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      isLoading: false,
      isTrialExpired: false,
      isPremium: false,
      user: { id: 'u1', email: 'test@example.com' } as any,
      error: null,
      refresh: vi.fn(),
      clearAuth: vi.fn(),
      profiles: [],
      activeProfileId: null,
      activeProfile: null,
      isLoadingProfiles: false,
      hasFamilyPlan: true,
      needsProfileSelection: false,
      selectProfile: vi.fn(),
      refreshProfiles: vi.fn(),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profiles: [{ id: 'p1', name: 'Main' }] }),
    }) as any;
  });

  it('redirects to home when no profile selection is needed', async () => {
    render(<ProfileSelectorPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('shows selector when switch=1 is present even if profile selection is not required', async () => {
    mockUseSearchParams.mockReturnValue({
      get: vi.fn((key: string) => (key === 'switch' ? '1' : null)),
    } as any);

    render(<ProfileSelectorPage />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-selector')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalledWith('/');
  });
});
