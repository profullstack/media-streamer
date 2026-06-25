/**
 * /connect — hosted "Connect TronBrowser" consent page.
 *
 * TronBrowser opens this (via chrome.identity) with ?redirect=<callback>. The
 * user signs in (Supabase) if needed, approves, and we mint an API token and
 * redirect to <callback>#token=btr_... which TronBrowser captures and stores.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isAllowedConnectRedirect } from '@/lib/api-tokens';

export const metadata = { title: 'Connect TronBrowser' };

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo = '' } = await searchParams;

  if (!redirectTo || !isAllowedConnectRedirect(redirectTo)) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Connect TronBrowser</h1>
        <p className="mt-3 text-red-400">Invalid or missing redirect target.</p>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const next = `/connect?redirect=${encodeURIComponent(redirectTo)}`;
    redirect(`/login?redirect=${encodeURIComponent(next)}`);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Connect to TronBrowser</h1>
      <p className="mt-4 text-gray-300">
        Allow <strong>TronBrowser</strong> to access your bittorrented.com favorites —
        live&nbsp;TV, radio, and podcasts — so they appear in your browser.
      </p>
      <p className="mt-2 text-sm text-gray-500">Signed in as {user!.email}.</p>

      <form method="post" action="/api/connect/approve" className="mt-6 flex gap-3">
        <input type="hidden" name="redirect" value={redirectTo} />
        <button
          type="submit"
          className="rounded-lg bg-cyan-400 px-5 py-2 font-semibold text-black hover:bg-cyan-300"
        >
          Allow
        </button>
        <a href="/" className="rounded-lg border border-gray-700 px-5 py-2 text-gray-300 hover:text-white">
          Cancel
        </a>
      </form>

      <p className="mt-6 text-xs text-gray-600">
        TronBrowser gets a read-only token for your media favorites. You can revoke it
        any time in your account settings.
      </p>
    </main>
  );
}
