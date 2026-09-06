/**
 * /iptv page tests: the terms on offer, where each button sends a reader, and
 * that a held pass is reported rather than sold again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/use-auth';
import { IptvPassPage } from './iptv-client';
import { offeredPackages, packageHref, perMonth } from '@/components/live-tv/iptv-offer-card';

let search = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

function auth(isLoggedIn: boolean): void {
  mockUseAuth.mockReturnValue({
    isLoggedIn,
    isLoading: false,
  } as unknown as ReturnType<typeof useAuth>);
}

describe('IptvPassPage', () => {
  beforeEach(() => {
    search = '';
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response) as unknown as typeof fetch;
  });

  it('offers the four real terms with the checkout price and a per-month line', () => {
    auth(false);
    render(<IptvPassPage />);
    const packages = offeredPackages();
    expect(packages.map((p) => p.packageKey)).toEqual([
      '1_month',
      '3_months',
      '6_months',
      '12_months',
    ]);
    for (const pkg of packages) {
      expect(screen.getByText(pkg.displayName)).toBeInTheDocument();
      expect(screen.getAllByText(`$${pkg.priceUsd.toFixed(2)}`).length).toBeGreaterThan(0);
      expect(screen.getAllByText(`$${perMonth(pkg)} / month`).length).toBeGreaterThan(0);
    }
    // Test packages are never on a sales surface.
    expect(screen.queryByText('24 Hour Test')).not.toBeInTheDocument();
    expect(screen.queryByText('3 Hour Test')).not.toBeInTheDocument();
  });

  it('sends every Get button to the account IPTV tab with that package preselected', () => {
    auth(true);
    render(<IptvPassPage />);
    for (const pkg of offeredPackages()) {
      const link = screen.getByRole('link', { name: `Get ${pkg.displayName}` });
      expect(link).toHaveAttribute('href', packageHref(pkg.packageKey, true));
      expect(link.getAttribute('href')).toBe(`/account?tab=iptv&package=${pkg.packageKey}`);
    }
  });

  it('routes a signed-out reader through login and back to the chosen term', () => {
    auth(false);
    search = 'package=3_months';
    render(<IptvPassPage />);
    const link = screen.getByRole('link', { name: 'Sign in and continue' });
    expect(link).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/account?tab=iptv&package=3_months')}`
    );
    expect(screen.getByText('Best value').closest('li')).toHaveTextContent('3 Months');
  });

  it('ignores an unknown package in the URL and highlights the year', () => {
    auth(false);
    search = 'package=3_hour_test';
    render(<IptvPassPage />);
    expect(screen.getByText('Best value').closest('li')).toHaveTextContent('12 Months');
  });

  it('reports a held pass instead of pretending the reader has none', async () => {
    auth(true);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        isActive: true,
        daysRemaining: 12,
        subscription: { expires_at: '2026-10-01T00:00:00Z', package_key: '1_month' },
      }),
    } as unknown as Response);
    render(<IptvPassPage />);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('active with 12 days left');
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/iptv/subscription');
  });

  it('never asks the API about a pass when nobody is signed in', () => {
    auth(false);
    render(<IptvPassPage />);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
