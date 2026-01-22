// DHT trackers to include in magnet URIs
const DHT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

// Build a magnet URI from infohash and name
export function buildMagnetUri(infohash: string, name: string): string {
  const encodedName = encodeURIComponent(name);
  const trackerParams = DHT_TRACKERS.map(
    (tracker) => `&tr=${encodeURIComponent(tracker)}`
  ).join('');

  return `magnet:?xt=urn:btih:${infohash.toLowerCase()}&dn=${encodedName}${trackerParams}`;
}

// Extract infohash from magnet URI
export function extractInfohash(magnet: string): string | null {
  const match = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
  return match ? match[1].toLowerCase() : null;
}
