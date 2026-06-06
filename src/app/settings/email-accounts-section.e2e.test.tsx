import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAccountsSection } from './email-accounts-section';

const mockFetch = vi.fn();

const accountsResponse = {
  accounts: [
    {
      id: 'acct-1',
      label: 'Personal',
      provider: 'Example',
      fromEmail: 'me@example.com',
      fromName: 'Me',
      replyToEmail: null,
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecurity: 'starttls',
      smtpUsername: 'me@example.com',
      isDefault: true,
      lastCheckedAt: null,
      lastCheckStatus: 'unchecked',
      lastCheckError: null,
    },
  ],
};

describe('Email accounts browser flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url === '/api/email/accounts' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => accountsResponse });
      }

      if (url === '/api/email/accounts' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ account: accountsResponse.accounts[0] }) });
      }

      if (url.endsWith('/check') && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, account: { ...accountsResponse.accounts[0], lastCheckStatus: 'success' } }) });
      }

      if (url.startsWith('/api/email/accounts/') && method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ account: accountsResponse.accounts[0] }) });
      }

      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('loads accounts, creates an SMTP account, and runs a health check', async () => {
    const user = userEvent.setup();
    render(<EmailAccountsSection />);

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Work');
    await user.type(screen.getByLabelText('From email'), 'work@example.com');
    await user.type(screen.getByLabelText('SMTP host'), 'smtp.work.example.com');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '465');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: /add account/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/email/accounts', expect.objectContaining({ method: 'POST' }));
    });

    await user.click(screen.getByRole('button', { name: /check personal/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/email/accounts/acct-1/check', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('fills SMTP settings from provider presets', async () => {
    const user = userEvent.setup();
    render(<EmailAccountsSection />);

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Provider type'), 'resend');

    expect(screen.getByLabelText('Label')).toHaveValue('Resend');
    expect(screen.getByLabelText('SMTP host')).toHaveValue('smtp.resend.com');
    expect(screen.getByLabelText('Port')).toHaveValue(587);
    expect(screen.getByLabelText('Security')).toHaveValue('starttls');
    expect(screen.getByLabelText('Username')).toHaveValue('resend');

    await user.type(screen.getByLabelText('From email'), 'noreply@example.com');
    await user.type(screen.getByLabelText('Password'), 're_secret');
    await user.click(screen.getByRole('button', { name: /add account/i }));

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(([url, init]) => (
        url === '/api/email/accounts' && init?.method === 'POST'
      ));
      expect(postCall).toBeTruthy();
      expect(JSON.parse(postCall?.[1]?.body as string)).toEqual(expect.objectContaining({
        provider: 'resend',
        smtpHost: 'smtp.resend.com',
        smtpPort: 587,
        smtpSecurity: 'starttls',
        smtpUsername: 'resend',
      }));
    });
  });
});
