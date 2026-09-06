/**
 * /swarm — the market.
 *
 * What a seeder picks work from, and what a reader sees instead of a bare
 * infohash. Every row carries the basis and the visibility in words, because
 * that is the difference between being asked to hold a stranger's ciphertext
 * and being asked to seed an openly licensed dataset in the clear.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { listMarket } from '@/lib/openswarm/service';
import { describeLane } from '@/lib/openswarm/lanes';
import type { MarketRow } from '@/lib/openswarm/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The swarm market | BitTorrented',
  description:
    'Data people are paying to keep alive, and what a seeder earns for holding it. Consent is signed at upload; public swarms are free to fetch.',
  alternates: { canonical: '/swarm' },
};

const BASIS_WORDS: Record<string, string> = {
  own: 'Their own work',
  licensed: 'Licensed for redistribution',
  'open-license': 'Open licence',
  'public-domain': 'Public domain',
  personal: 'Personal backup',
};

function gib(bytes: number): string {
  const value = bytes / 1024 ** 3;
  return value >= 10 ? `${Math.round(value)} GB` : `${value.toFixed(1)} GB`;
}

function Row({ row }: { row: MarketRow }): React.ReactElement {
  const { offer } = row;
  return (
    <li className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/swarm/${encodeURIComponent(offer.id)}`} className="font-medium text-text-primary hover:underline">
          {row.description || row.summary || 'An unnamed swarm'}
        </Link>
        <span className="text-sm text-text-secondary">
          ${row.projectedUsd} <span className="text-text-muted">for {offer.days} days</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-text-secondary">{row.summary}</p>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
        <div>
          <dt className="inline">Basis: </dt>
          <dd className="inline text-text-secondary">
            {BASIS_WORDS[row.basis] ?? row.basis}
            {row.license ? ` (${row.license})` : ''}
          </dd>
        </div>
        <div>
          <dt className="inline">Visibility: </dt>
          <dd className="inline text-text-secondary">
            {row.visibility === 'public' ? 'public, readable by anyone' : 'private, ciphertext only'}
          </dd>
        </div>
        <div>
          <dt className="inline">Size: </dt>
          <dd className="inline text-text-secondary">{gib(offer.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="inline">Slots: </dt>
          <dd className="inline text-text-secondary">
            {row.slotsFree} free of {offer.seedersMax}
          </dd>
        </div>
        <div>
          <dt className="inline">Posted by: </dt>
          <dd className="inline text-text-secondary">{row.requesterKind === 'bit' ? 'an agent' : 'a person'}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function SwarmMarketPage(): Promise<React.ReactElement> {
  let rows: MarketRow[] = [];
  let error: string | null = null;
  try {
    rows = await listMarket({ limit: 50 });
  } catch {
    error = 'The market could not be read just now.';
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-text-primary">The swarm market</h1>
          <p className="mt-2 max-w-2xl text-text-secondary">
            Data somebody is paying to keep alive, and what a seeder earns for holding it. Consent is signed at
            upload, so every swarm here says who put it there and on what basis. Public swarms are free to fetch;
            private ones are ciphertext a seeder holds without ever reading.
          </p>
        </header>

        <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4 text-sm text-text-secondary">
          <p>
            Both sides earn. Rent out disk you already have, or pay to keep something online. The hub takes 1
            percent of what crosses it, charged to whoever is paying and never taken out of a seeder&apos;s floor.
            It carries every lane: {describeLane('h2h')}, {describeLane('h2b')}, {describeLane('b2h')} and{' '}
            {describeLane('b2b')}.
          </p>
          <p className="mt-2 text-text-muted">
            The protocol is open:{' '}
            <a href="https://logicsrc.com/openswarm" className="text-accent-primary hover:underline" rel="noreferrer">
              pay2seed, paid2seed, pay2stream and paid2stream
            </a>
            .
          </p>
        </div>

        {error ? <p className="text-status-error">{error}</p> : null}

        {rows.length ? (
          <ul className="space-y-3">
            {rows.map((row) => (
              <Row key={row.offer.id} row={row} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-border-subtle bg-bg-secondary p-6 text-text-muted">
            Nothing is listed yet. A public claim waits out its window before it appears here, so that a notice can
            void it before anyone is paid to seed it.
          </p>
        )}
      </div>
    </MainLayout>
  );
}
