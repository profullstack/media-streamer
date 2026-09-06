import type { Metadata } from 'next';
import { IptvPassPage } from './iptv-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live TV Passes | BitTorrented',
  description:
    'Thousands of live channels and sports on our line. One, three, six or twelve months, paid in crypto, playing in Live TV or any M3U player.',
  alternates: { canonical: '/iptv' },
};

/**
 * /iptv: the page that sells a Live TV pass, and reports on the one held.
 *
 * Readable signed out, the way /pricing is, so a search hit or a link from a
 * torrent page can land here. Every number comes from the same table the
 * checkout charges. Buying happens on the account's IPTV tab, where the
 * crypto picker and the CoinPay handoff already live; this page only chooses
 * the term and sends the reader there with it preselected.
 */
export default function IptvPage(): React.ReactElement {
  return <IptvPassPage />;
}
