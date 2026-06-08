"use client";

import { useState, useTransition } from "react";
import { upgradeUserByEmail } from "@/app/actions/admin";

export function AdminTools({ recipientCount }: { recipientCount: number }) {
  const [pendingUpgrade, startUpgrade] = useTransition();
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradeTier, setUpgradeTier] = useState("premium");
  const [upgradeMonths, setUpgradeMonths] = useState(12);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [broadcastPending, setBroadcastPending] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  const onUpgrade = (event: React.FormEvent) => {
    event.preventDefault();
    setUpgradeMessage(null);
    setUpgradeError(null);

    startUpgrade(async () => {
      const result = await upgradeUserByEmail({
        email: upgradeEmail,
        tier: upgradeTier,
        months: upgradeMonths,
      });

      if (!result.ok) {
        setUpgradeError(result.error);
        return;
      }

      setUpgradeMessage(
        `${result.email} is now ${result.tier} until ${new Date(result.expiresAt).toLocaleDateString()}.`
      );
      setUpgradeEmail("");
    });
  };

  const onBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    setBroadcastPending(true);
    setBroadcastMessage(null);
    setBroadcastError(null);

    try {
      const response = await fetch("/api/admin/email-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = (await response.json()) as {
        error?: string;
        sent?: number;
        failed?: number;
      };

      if (!response.ok) {
        setBroadcastError(data.error ?? "Failed to send broadcast.");
        return;
      }

      setBroadcastMessage(`Sent ${data.sent ?? 0} emails${data.failed ? `, ${data.failed} failed` : ""}.`);
      setSubject("");
      setBody("");
    } catch (error) {
      setBroadcastError(error instanceof Error ? error.message : "Failed to send broadcast.");
    } finally {
      setBroadcastPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onUpgrade} className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Upgrade account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Find a Supabase Auth account by email and grant a paid subscription.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_130px_110px_auto]">
          <input
            className="rounded border border-border bg-background px-3 py-2 text-sm"
            type="email"
            value={upgradeEmail}
            onChange={(event) => setUpgradeEmail(event.target.value)}
            placeholder="user@example.com"
            required
          />
          <select
            className="rounded border border-border bg-background px-3 py-2 text-sm"
            value={upgradeTier}
            onChange={(event) => setUpgradeTier(event.target.value)}
          >
            <option value="premium">Premium</option>
            <option value="family">Family</option>
          </select>
          <input
            className="rounded border border-border bg-background px-3 py-2 text-sm"
            type="number"
            min={1}
            max={60}
            value={upgradeMonths}
            onChange={(event) => setUpgradeMonths(Number(event.target.value))}
            required
          />
          <button
            type="submit"
            disabled={pendingUpgrade}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80 disabled:opacity-50"
          >
            {pendingUpgrade ? "Saving" : "Upgrade"}
          </button>
        </div>
        {upgradeError ? <p className="text-sm text-red-500">{upgradeError}</p> : null}
        {upgradeMessage ? <p className="text-sm text-green-600">{upgradeMessage}</p> : null}
      </form>

      <form onSubmit={onBroadcast} className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">News email broadcast</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sends through Profullstack Emailer to {recipientCount.toLocaleString()} account emails.
          </p>
        </div>
        <input
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          maxLength={160}
          required
        />
        <textarea
          className="min-h-44 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Email body"
          required
        />
        <button
          type="submit"
          disabled={broadcastPending}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80 disabled:opacity-50"
        >
          {broadcastPending ? "Sending" : "Send broadcast"}
        </button>
        {broadcastError ? <p className="text-sm text-red-500">{broadcastError}</p> : null}
        {broadcastMessage ? <p className="text-sm text-green-600">{broadcastMessage}</p> : null}
      </form>
    </div>
  );
}
