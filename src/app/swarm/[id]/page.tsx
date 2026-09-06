/**
 * /swarm/[id] — one swarm's page, built from its README.
 *
 * This is what a consented swarm looks like beside a bare infohash. The README
 * is rendered from the attestation, so the page works without a key even when
 * the swarm itself is ciphertext nobody here can read.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { MainLayout } from '@/components/layout';
import { getAttestation, getOffer } from '@/lib/openswarm/service';
import { readmeSummary, renderReadme } from '@/lib/openswarm/markdown';

export const dynamic = 'force-dynamic';

const BASIS_WORDS: Record<string, string> = {
  own: 'Their own work',
  licensed: 'Licensed for redistribution',
  'open-license': 'Open licence',
  'public-domain': 'Public domain',
  personal: 'Personal backup',
};

async function load(id: string) {
  const offer = await getOffer(id);
  if (!offer) return null;
  const attestation = await getAttestation(offer.attestationId);
  return attestation ? { offer, attestation } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = await load(decodeURIComponent(id)).catch(() => null);
  if (!found) return { title: 'Swarm | BitTorrented' };
  const title = found.attestation.description || readmeSummary(found.attestation.readme, 60) || 'A swarm';
  return {
    title: `${title} | BitTorrented`,
    description: readmeSummary(found.attestation.readme),
    alternates: { canonical: `/swarm/${id}` },
  };
}

export default async function SwarmPage({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactElement> {
  const { id } = await params;
  const found = await load(decodeURIComponent(id)).catch(() => null);
  if (!found) notFound();
  const { offer, attestation } = found;

  // The renderer emits no raw HTML from the source; sanitising as well is the
  // second cheap defence rather than the only one.
  const html = DOMPurify.sanitize(renderReadme(attestation.readme), { USE_PROFILES: { html: true } });
  const subject =
    attestation.subject.infohashV1 || attestation.subject.infohashV2 || attestation.subject.file || attestation.subject.channel;

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <nav className="text-sm text-text-muted">
          <Link href="/swarm" className="hover:underline">
            The swarm market
          </Link>
        </nav>

        <header>
          <h1 className="text-2xl font-bold text-text-primary">
            {attestation.description || readmeSummary(attestation.readme, 70) || 'A swarm'}
          </h1>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-muted">
            <div>
              <dt className="inline">Basis: </dt>
              <dd className="inline text-text-secondary">
                {BASIS_WORDS[attestation.basis] ?? attestation.basis}
                {attestation.license ? ` (${attestation.license})` : ''}
              </dd>
            </div>
            <div>
              <dt className="inline">Visibility: </dt>
              <dd className="inline text-text-secondary">
                {attestation.visibility === 'public' ? 'public' : 'private, ciphertext only'}
              </dd>
            </div>
            <div>
              <dt className="inline">Status: </dt>
              <dd className="inline text-text-secondary">{attestation.status}</dd>
            </div>
          </dl>
        </header>

        <article
          className="prose prose-invert max-w-none rounded-lg border border-border-subtle bg-bg-secondary p-5 text-text-secondary [&_a]:text-accent-primary [&_code]:text-text-primary [&_h2]:text-text-primary [&_h3]:text-text-primary [&_strong]:text-text-primary [&_table]:w-full [&_td]:border-b [&_td]:border-border-subtle [&_td]:py-1 [&_th]:border-b [&_th]:border-border-subtle [&_th]:py-1 [&_th]:text-left"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <section className="rounded-lg border border-border-subtle bg-bg-secondary p-4 text-sm">
          <h2 className="font-medium text-text-primary">What is on offer</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-text-secondary sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Kept for</dt>
              <dd>{offer.days} days</dd>
            </div>
            <div>
              <dt className="text-text-muted">Seeders wanted</dt>
              <dd>
                {offer.seedersMin} to {offer.seedersMax}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Per GiB-month</dt>
              <dd>${offer.priceUsdPerGibMonth}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Budget</dt>
              <dd>${offer.budgetUsd}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Paid out so far</dt>
              <dd>${offer.spentUsd}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Offer status</dt>
              <dd>{offer.status}</dd>
            </div>
          </dl>
          {subject ? <p className="mt-3 break-all text-xs text-text-muted">Subject: {subject}</p> : null}
        </section>

        <p className="text-sm text-text-muted">
          Something wrong with this listing?{' '}
          <Link href="/contact" className="text-accent-primary hover:underline">
            File a notice
          </Link>
          . An attestation that is voided takes every offer and lease on it with it.
        </p>
      </div>
    </MainLayout>
  );
}
