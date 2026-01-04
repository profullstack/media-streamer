/**
 * Type declarations for WebTorrent browser bundle
 *
 * The browser bundle (webtorrent.min.js) doesn't have type declarations,
 * so we declare the module here to allow importing it.
 */

declare module 'webtorrent/dist/webtorrent.min.js' {
  interface WebTorrentFile {
    name: string;
    length: number;
    path: string;
    streamURL: string;
    getBlobURL: (callback: (err: Error | null, url?: string) => void) => void;
  }

  interface WebTorrentTorrent {
    infoHash: string;
    name: string;
    files: WebTorrentFile[];
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    ready: boolean;
    on: (event: string, callback: (...args: unknown[]) => void) => void;
    off: (event: string, callback: (...args: unknown[]) => void) => void;
    destroy: (callback?: () => void) => void;
  }

  class WebTorrent {
    constructor();
    add: (magnetUri: string, callback?: (torrent: WebTorrentTorrent) => void) => WebTorrentTorrent;
    get: (infoHash: string) => WebTorrentTorrent | null;
    remove: (infoHash: string, callback?: () => void) => void;
    destroy: (callback?: () => void) => void;
    on: (event: string, callback: (...args: unknown[]) => void) => void;
    torrents: WebTorrentTorrent[];
  }

  export default WebTorrent;
}
