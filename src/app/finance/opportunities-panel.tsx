'use client';

/**
 * OpportunitiesPanel — AI stock-idea screen on the finance hub.
 *
 * The user provides free-text parameters (pre-filled with a sensible default)
 * and we feed them to the AI to generate a ranked candidate list. Each pick
 * links into the ticker page. Generation never runs on load — only on click —
 * because it spends AI tokens (same cost boundary as the report panel).
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_OPPORTUNITIES_PROMPT, MAX_PROMPT_LENGTH } from '@/lib/finance/opportunities/prompt';
import type { OpportunityList, OpportunityStock } from '@/lib/finance/opportunities/types';

type Phase = 'idle' | 'generating' | 'ready' | 'error';

export function OpportunitiesPanel(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_OPPORTUNITIES_PROMPT);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpportunityList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setPhase('generating');
    setError(null);
    try {
      const res = await fetch('/api/finance/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.status === 429) {
        const body = await res.json();
        setError(body.message ?? 'Daily analysis limit reached.');
        setPhase(result ? 'ready' : 'error');
        return;
      }
      if (!res.ok) {
        setError('Could not generate opportunities. Please try again.');
        setPhase(result ? 'ready' : 'error');
        return;
      }
      const body = (await res.json()) as { opportunities: OpportunityList };
      setResult(body.opportunities);
      setPhase('ready');
    } catch {
      setError('Network error generating opportunities.');
      setPhase(result ? 'ready' : 'error');
    }
  }, [prompt, result]);

  const copyMarkdown = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable; non-fatal.
    }
  }, [result]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Opportunities</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-secondary text-sm">
          {open ? 'Hide' : '✨ Find opportunities'}
        </button>
      </div>

      {open ? (
        <div className="card mt-3 overflow-hidden">
          <div className="border-b border-border-subtle bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            Not financial advice. AI-generated idea screen for informational/entertainment use only.
          </div>

          <div className="p-4">
            <label htmlFor="opp-prompt" className="text-sm text-text-secondary">
              Describe what you’re looking for
            </label>
            <textarea
              id="opp-prompt"
              className="input mt-2 h-24 w-full resize-y"
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={DEFAULT_OPPORTUNITIES_PROMPT}
              spellCheck
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={phase === 'generating'}
                className="btn btn-primary text-sm disabled:opacity-60"
              >
                {phase === 'generating' ? 'Generating…' : result ? 'Regenerate' : 'Generate ideas'}
              </button>
              {result ? (
                <button type="button" onClick={copyMarkdown} className="btn btn-secondary text-sm">
                  {copied ? 'Copied!' : 'Copy markdown'}
                </button>
              ) : null}
              <span className="text-xs text-text-muted">Each run uses AI tokens.</span>
            </div>

            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

            {phase === 'generating' && (
              <p className="mt-4 text-sm text-text-muted">
                Screening the market — this usually takes 10–30 seconds.
              </p>
            )}

            {phase === 'ready' && result ? <OpportunityResults result={result} /> : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">
          Let AI screen the market for ideas that match parameters you choose (e.g. price, time horizon).
        </p>
      )}
    </section>
  );
}

function OpportunityResults({ result }: { result: OpportunityList }): React.ReactElement {
  return (
    <div className="mt-5">
      {result.intro ? <p className="text-sm leading-relaxed text-text-secondary">{result.intro}</p> : null}

      <ol className="mt-4 space-y-3">
        {result.stocks.map((stock, i) => (
          <OpportunityCard key={stock.symbol} rank={i + 1} stock={stock} />
        ))}
      </ol>

      <p className="mt-5 text-xs text-text-muted">
        {result.stocks.length} idea{result.stocks.length === 1 ? '' : 's'} · model {result.model} ·{' '}
        {result.usage.totalTokens.toLocaleString()} tokens · {new Date(result.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function OpportunityCard({ rank, stock }: { rank: number; stock: OpportunityStock }): React.ReactElement {
  return (
    <li className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs text-text-muted">#{rank}</span>
        <Link href={`/finance/ticker/${stock.symbol}`} className="text-lg font-semibold text-blue-400 hover:underline">
          {stock.symbol}
        </Link>
        {stock.name ? <span className="text-sm text-text-secondary">{stock.name}</span> : null}
        {stock.priceContext ? (
          <span className="ml-auto text-xs text-text-muted">{stock.priceContext}</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{stock.thesis}</p>
      {stock.catalysts ? (
        <p className="mt-2 text-xs text-text-muted">
          <span className="font-semibold uppercase tracking-wide text-green-400">Catalysts</span> · {stock.catalysts}
        </p>
      ) : null}
      {stock.risk ? (
        <p className="mt-1 text-xs text-text-muted">
          <span className="font-semibold uppercase tracking-wide text-red-400">Risk</span> · {stock.risk}
        </p>
      ) : null}
    </li>
  );
}
