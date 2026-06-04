"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIntegration, revokeIntegration, type IntegrationKind } from "@/app/actions/integrations";

type Integration = {
  id: string;
  name: string;
  kind: IntegrationKind;
  access_token: string;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
};

const KIND_META: Record<IntegrationKind, { label: string; webhookPath: string }> = {
  outrank: { label: "Outrank", webhookPath: "/api/webhooks/autoblog" },
  crawlproof: { label: "Crawlproof", webhookPath: "/api/webhooks/autoblog" },
};

export function IntegrationsManager({ initial }: { initial: Integration[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<Integration[]>(initial);
  const [kind, setKind] = useState<IntegrationKind>("crawlproof");
  const [name, setName] = useState("Crawlproof");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);

  // Read origin client-side only to avoid SSR mismatch — no setState needed.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJustCreatedToken(null);
    start(async () => {
      const res = await createIntegration({ name, kind });
      if (!res.ok) { setError(res.error); return; }
      setJustCreatedToken(res.accessToken);
      setName(kind === "crawlproof" ? "Crawlproof" : "Outrank");
      router.refresh();
    });
  };

  const onRevoke = (it: Integration) => {
    if (!confirm(`Revoke "${it.name}"? The source will stop being able to publish.`)) return;
    start(async () => {
      const res = await revokeIntegration({ id: it.id });
      if (!res.ok) { setError(res.error); return; }
      setItems((prev) => prev.filter((i) => i.id !== it.id));
      router.refresh();
    });
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const webhookUrl = `${origin}/api/webhooks/autoblog`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Webhook endpoint</p>
        <div className="flex gap-2">
          <code className="flex-1 break-all rounded border border-border bg-muted px-3 py-2 text-xs">
            {webhookUrl || "https://bittorrented.com/api/webhooks/autoblog"}
          </code>
          <button type="button" onClick={() => copy("url", webhookUrl)} className="px-3 py-2 text-sm border border-border rounded hover:bg-muted">
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <form onSubmit={onCreate}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Generate token</p>
        <div className="flex gap-2 flex-wrap">
          <select value={kind} onChange={(e) => { const k = e.target.value as IntegrationKind; setKind(k); setName(k === "crawlproof" ? "Crawlproof" : "Outrank"); }}
            className="px-3 py-2 text-sm border border-border rounded bg-background">
            <option value="crawlproof">Crawlproof</option>
            <option value="outrank">Outrank</option>
          </select>
          <input className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-border rounded bg-background"
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Integration name" maxLength={100} required />
          <button type="submit" disabled={pending}
            className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded hover:opacity-80 disabled:opacity-50">
            {pending ? "…" : "Generate"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        {justCreatedToken ? <div className="mt-3 rounded border border-green-500/40 bg-green-500/5 p-3 text-xs">
            <p className="mb-1 font-semibold text-green-600">Token created — copy now and paste into CrawlProof autoblog webhook settings.</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all">{justCreatedToken}</code>
              <button type="button" onClick={() => copy("new", justCreatedToken)} className="px-2 py-1 border border-border rounded text-xs">
                {copied === "new" ? "Copied" : "Copy"}
              </button>
            </div>
          </div> : null}
      </form>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Access tokens ({items.length})
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet — generate one above.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const show = !!revealed[it.id];
              const masked = `${it.access_token.slice(0, 8)}…${it.access_token.slice(-4)}`;
              return (
                <li key={it.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{KIND_META[it.kind]?.label ?? it.kind}</span>
                        <span className="text-xs text-muted-foreground">
                          {it.request_count} requests
                          {it.last_used_at ? ` · last ${new Date(it.last_used_at).toLocaleString()}` : null}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 break-all rounded border border-border bg-muted px-2 py-1 text-xs">
                          {show ? it.access_token : masked}
                        </code>
                        <button type="button" onClick={() => setRevealed((p) => ({ ...p, [it.id]: !p[it.id] }))}
                          className="text-xs text-muted-foreground hover:text-foreground">
                          {show ? "Hide" : "Reveal"}
                        </button>
                        <button type="button" onClick={() => copy(it.id, it.access_token)}
                          className="text-xs text-muted-foreground hover:text-foreground">
                          {copied === it.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <button type="button" onClick={() => onRevoke(it)} disabled={pending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50">
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
