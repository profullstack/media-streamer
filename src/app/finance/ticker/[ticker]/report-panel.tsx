'use client';

/**
 * ReportPanel — the AI report area (PRD §3.2, §3.3, §6).
 *
 * States: empty (Analyze CTA), generating (loading + est. wait), and rendered
 * (typed sections, sticky non-dismissible disclaimer, sources, generated-at +
 * model, Refresh action). Generation never runs on load — only on click.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FinanceReport, FinanceReportSections, ReportSource } from '@/lib/finance/analysis/types';

interface ApiReport extends FinanceReport {
  expired?: boolean;
}

type Phase = 'idle' | 'loading-cache' | 'empty' | 'generating' | 'ready' | 'error';

export function ReportPanel({ symbol }: { symbol: string }): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('loading-cache');
  const [report, setReport] = useState<ApiReport | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load an existing cached report on mount (cheap GET, no tokens spent).
  useEffect(() => {
    let cancelled = false;
    setPhase('loading-cache');
    fetch(`/api/finance/report?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setPhase('empty');
          return;
        }
        if (!res.ok) {
          setPhase('empty');
          return;
        }
        const body = (await res.json()) as { report: ApiReport; stale?: boolean };
        setReport(body.report);
        setStale(Boolean(body.stale));
        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('empty');
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const generate = useCallback(
    async (refresh: boolean) => {
      setPhase('generating');
      setError(null);
      try {
        const res = await fetch('/api/finance/report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol, refresh }),
        });
        if (res.status === 429) {
          const body = await res.json();
          setError(body.message ?? 'Daily analysis limit reached.');
          setPhase(report ? 'ready' : 'error');
          return;
        }
        if (!res.ok) {
          setError('Could not generate the report. Please try again.');
          setPhase(report ? 'ready' : 'error');
          return;
        }
        const body = (await res.json()) as { report: ApiReport };
        setReport(body.report);
        setStale(false);
        setPhase('ready');
      } catch {
        setError('Network error generating the report.');
        setPhase(report ? 'ready' : 'error');
      }
    },
    [symbol, report],
  );

  return (
    <section className="card mt-8 overflow-hidden">
      {/* Sticky, non-dismissible disclaimer (PRD §6, §8). */}
      <div className="sticky top-0 z-10 border-b border-border-subtle bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
        Not financial advice. Informational/entertainment only — we are not a registered investment adviser.
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">AI research report</h2>
            <p className="mt-1 text-sm text-text-muted">
              A long-form narrative thesis — catalysts, bull/bear cases, valuation framing, and risks.
            </p>
          </div>
          {phase === 'ready' && report ? (
            <button type="button" onClick={() => generate(true)} className="btn btn-secondary text-sm">
              Refresh analysis
            </button>
          ) : (
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={phase === 'generating' || phase === 'loading-cache'}
              className="btn btn-primary text-sm disabled:opacity-60"
            >
              {phase === 'generating' ? 'Analyzing…' : `Analyze ${symbol}`}
            </button>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        {phase === 'generating' && (
          <p className="mt-4 text-sm text-text-muted">
            Generating — this usually takes 10–30 seconds while we gather data and write the narrative.
          </p>
        )}

        {phase === 'empty' && (
          <p className="mt-4 text-sm text-text-muted">
            No report yet. Click <span className="font-medium text-text-secondary">Analyze {symbol}</span> to
            generate one. Each run uses AI tokens, so it only runs when you ask.
          </p>
        )}

        {phase === 'ready' && report ? <ReportBody report={report} stale={stale} onRefresh={() => generate(true)} /> : null}
      </div>
    </section>
  );
}

function ReportBody({
  report,
  stale,
  onRefresh,
}: {
  report: ApiReport;
  stale: boolean;
  onRefresh: () => void;
}): React.ReactElement {
  const sections = report.sections;
  const generatedAt = new Date(report.generatedAt);

  return (
    <div className="mt-5">
      {stale ? <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2 text-xs text-text-muted">
          <span>This report is past its freshness window.</span>
          <button type="button" onClick={onRefresh} className="text-amber-300 hover:underline">
            Refresh
          </button>
        </div> : null}

      <Prose title="Summary" body={sections.summary} />
      <ListSection title="Recent catalysts" items={sections.catalysts} />
      <Prose title="Bull case" body={sections.bullCase} />
      <Prose title="Bear case" body={sections.bearCase} />
      <Prose title="Valuation" body={sections.valuation} />
      <ListSection title="Risks" items={sections.risks} />
      <Sources sources={report.sources} />

      <p className="mt-6 text-xs text-text-muted">
        Generated {generatedAt.toLocaleString()} · model {report.model} · {report.usage.totalTokens.toLocaleString()} tokens
      </p>
    </div>
  );
}

function Prose({ title, body }: { title: string; body: string }): React.ReactElement | null {
  if (!body) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{body}</p>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }): React.ReactElement | null {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Sources({ sources }: { sources: ReportSource[] }): React.ReactElement | null {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Sources</h3>
      <ul className="mt-2 space-y-1 text-sm text-text-secondary">
        {sources.map((s, i) => (
          <li key={i}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { FinanceReportSections };
