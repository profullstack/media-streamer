import { IptvRentOut } from './rent-out-client';

export const dynamic = 'force-dynamic';

/**
 * Live TV → Rent Out. List one of your IPTV playlists for resale by the game.
 * See docs/prds/iptv-pay-per-game.md.
 */
export default function IptvRentOutPage(): React.ReactElement {
  return <IptvRentOut />;
}
