'use client';

/**
 * "Which box?" Servers with big disks, from r4ck.dev.
 *
 * Shown where a member is about to connect a seedbox and has not got one, and (compact)
 * on the page that sells the plan. Every row and the "see all" link go to r4ck.dev, our
 * server search engine. Prices are r4ck's monthly estimates of what the provider
 * publishes, so they are quoted as "about".
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Offer {
  id: number;
  name: string;
  provider: string;
  kind: string;
  diskGb: number;
  diskType: string | null;
  vcpu: number | null;
  ramGb: number | null;
  bandwidthMbps: number | null;
  transferGb: number | null;
  monthlyUsd: number;
  usdPerTb: number;
  countries: string[];
  inStock: boolean;
  url: string;
}

interface Answer {
  preset: string;
  presets: { key: string; label: string; blurb: string }[];
  offers: Offer[];
  browseUrl: string;
}

const disk = (gb: number): string => (gb >= 1000 ? `${Math.round(gb / 100) / 10} TB` : `${gb} GB`);
const line = (mbps: number | null): string | null =>
  mbps === null ? null : mbps >= 1000 ? `${Math.round(mbps / 100) / 10} Gbit` : `${mbps} Mbit`;
const money = (usd: number): string => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`);

interface ServerOffersProps {
  /** Fewer rows and no tabs: for a page where this is an aside. */
  compact?: boolean;
  className?: string;
}

export function ServerOffers({ compact = false, className }: ServerOffersProps): React.ReactElement | null {
  const [preset, setPreset] = useState('big');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/public/server-offers?preset=${encodeURIComponent(preset)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Answer;
        if (alive) {
          setAnswer(body);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [preset]);

  const offers = (answer?.offers ?? []).slice(0, compact ? 3 : 6);
  // An aside with nothing in it is not worth its heading.
  if (compact && (failed || (answer !== null && offers.length === 0))) return null;

  return (
    <section className={cn('rounded-xl border border-border-subtle bg-bg-secondary p-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-text-primary">{compact ? 'Need a box for your seedbox?' : 'Need a box? Big disks, cheapest first'}</h3>
        <a
          href={answer?.browseUrl ?? 'https://r4ck.dev/servers?ref=bittorrented'}
          target="_blank"
          rel="noopener"
          className="text-sm font-medium text-accent-primary hover:underline"
        >
          See all on r4ck.dev
        </a>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        Live prices from{' '}
        <a href="https://r4ck.dev/?ref=bittorrented" target="_blank" rel="noopener" className="underline">
          r4ck.dev
        </a>
        , our search engine for every server on sale. Any Linux box you can SSH into works.
      </p>

      {!compact && answer ? (
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Server size">
          {answer.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={preset === p.key}
              title={p.blurb}
              onClick={() => setPreset(p.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                preset === p.key
                  ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                  : 'border-border-default text-text-secondary hover:border-accent-primary/50'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {answer === null && !failed ? <p className="mt-4 text-sm text-text-muted">Looking up prices…</p> : null}
      {failed || (answer !== null && offers.length === 0) ? (
        <p className="mt-4 text-sm text-text-muted">
          Prices are not loading right now.{' '}
          <a href="https://r4ck.dev/servers?min_disk=2000&sort=price&ref=bittorrented" target="_blank" rel="noopener" className="underline">
            Search r4ck.dev directly
          </a>
          .
        </p>
      ) : null}

      {offers.length > 0 ? (
        <ul className={cn('mt-4 grid gap-3', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3')}>
          {offers.map((o) => {
            const specs = [
              o.vcpu ? `${o.vcpu} vCPU` : null,
              o.ramGb ? `${o.ramGb} GB RAM` : null,
              line(o.bandwidthMbps),
              o.countries.length > 0 ? o.countries.join(' ') : null,
            ].filter(Boolean);
            return (
              <li key={o.id}>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener"
                  className="flex h-full flex-col rounded-lg border border-border-default bg-bg-tertiary p-4 transition-colors hover:border-accent-primary"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xl font-bold text-text-primary">
                      {disk(o.diskGb)}
                      {o.diskType ? <span className="ml-1 text-xs font-medium uppercase text-text-muted">{o.diskType}</span> : null}
                    </span>
                    <span className="text-sm font-semibold text-accent-primary">about {money(o.monthlyUsd)}/mo</span>
                  </span>
                  <span className="mt-1 truncate text-sm text-text-primary" title={o.name}>
                    {o.provider} · {o.name}
                  </span>
                  {specs.length > 0 ? <span className="mt-1 text-xs text-text-muted">{specs.join(' · ')}</span> : null}
                  <span className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <span>{money(o.usdPerTb)} per TB</span>
                    {o.inStock ? <span className="text-status-success">in stock</span> : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
