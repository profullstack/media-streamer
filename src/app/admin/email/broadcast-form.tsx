'use client';

import { useState } from 'react';

type BroadcastResult = { error?: string; sent?: number; failed?: number; recipients?: number; test?: boolean };

export function BroadcastForm({ recipientCount, adminEmail }: { recipientCount: number; adminEmail: string }) {
  const [pending, setPending] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (test: boolean) => {
    if (!test && !confirm(`Send "${subject}" to ${recipientCount.toLocaleString()} accounts? This cannot be recalled.`)) {
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/email-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, test }),
      });
      const data = (await response.json()) as BroadcastResult;

      if (!response.ok) {
        setError(data.error ?? 'Failed to send broadcast.');
        return;
      }

      if (test) {
        setMessage(`Test sent to ${adminEmail}.`);
      } else {
        setMessage(`Sent ${data.sent ?? 0} emails${data.failed ? `, ${data.failed} failed` : ''}.`);
        setSubject('');
        setBody('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send broadcast.');
    } finally {
      setPending(false);
    }
  };

  const ready = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send(false);
      }}
      className="space-y-3"
    >
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Email every account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Sends through Profullstack Emailer to {recipientCount.toLocaleString()} account emails. Blank lines
          start a new paragraph. Send yourself a test first.
        </p>
      </div>
      <input
        className="w-full rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
        type="text"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Subject"
        maxLength={160}
        required
      />
      <textarea
        className="min-h-56 w-full rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Email body"
        required
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() => void send(true)}
          className="rounded border border-border-default px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover disabled:opacity-50"
        >
          {pending ? 'Sending' : `Send test to ${adminEmail}`}
        </button>
        <button
          type="submit"
          disabled={pending || !ready}
          className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
        >
          {pending ? 'Sending' : `Send to ${recipientCount.toLocaleString()} accounts`}
        </button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-green-400">{message}</p> : null}
    </form>
  );
}
